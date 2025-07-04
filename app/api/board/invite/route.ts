import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { connectToDatabase } from '@/lib/database/mongodb';
import { ObjectId } from 'mongodb';
import { EmailService } from '@/lib/email/sendgrid';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';
import { User } from '@/types';
import { pubSub } from '@/lib/graphql/schema';

interface BoardCollaborator {
  id: string;
  email: string;
  name: string;
}

export async function POST(request: NextRequest) {
  try {
    const { boardId, inviteeEmail, message } = await request.json();

    if (!boardId || !inviteeEmail) {
      return NextResponse.json(
        { error: 'Board ID and invitee email are required' },
        { status: 400 }
      );
    }

    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Connect to database
    const db = await connectToDatabase();

    // Find the board and verify ownership
    const board = await db.collection('boards').findOne(
      { _id: new ObjectId(boardId) },
      { projection: { name: 1, createdBy: 1, collaborators: 1 } }
    );

    if (!board) {
      return NextResponse.json(
        { error: 'Board not found' },
        { status: 404 }
      );
    }

    // Check if user is owner or collaborator
    const isOwner = board.createdBy.toString() === session.user.id;
    const isCollaborator = board.collaborators?.some(
      (collab: BoardCollaborator) => collab.id === session.user.id
    );

    if (!isOwner && !isCollaborator) {
      return NextResponse.json(
        { error: 'Not authorized to invite collaborators to this board' },
        { status: 403 }
      );
    }

    // Check if user is already a collaborator
    const isAlreadyCollaborator = board.collaborators?.some(
      (collab: BoardCollaborator) => collab.email === inviteeEmail
    );

    if (isAlreadyCollaborator) {
      return NextResponse.json(
        { error: 'User is already a collaborator on this board' },
        { status: 400 }
      );
    }

    // Check if there's already a pending invitation
    const existingInvitation = await db.collection('board_invitations').findOne({
      boardId: new ObjectId(boardId),
      inviteeEmail,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      );
    }

    // Generate invitation token
    const invitationToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    // Create invitation record
    const invitation = {
      boardId: new ObjectId(boardId),
      inviterUserId: new ObjectId(session.user.id),
      inviteeEmail,
      invitationToken,
      status: 'pending',
      message: message || '',
      createdAt: new Date(),
      expiresAt,
    };

    const result = await db.collection('board_invitations').insertOne(invitation);

    if (!result.insertedId) {
      throw new Error('Failed to create invitation record');
    }

    // Send invitation email
    const emailSent = await EmailService.sendInvitationEmail({
      boardId,
      boardName: board.name,
      inviterName: session.user.name || 'CyperBoard User',
      inviterEmail: session.user.email || '',
      inviteeEmail,
      invitationToken,
      message,
    });

    if (!emailSent) {
      // If email fails, we should clean up the invitation record
      await db.collection('board_invitations').deleteOne({ _id: result.insertedId });
      logger.error(`Failed to send invitation email for board ${boardId} to ${inviteeEmail}`);
      
      return NextResponse.json({
        success: false,
        error: 'Failed to send invitation email. Please check the email address and try again.',
        emailSent: false,
      }, { status: 500 });
    }

    // Publish real-time notification to board collaborators
    try {
      pubSub.publish('collaboratorInvited', boardId, {
        boardId,
        inviteeEmail,
        inviterName: session.user.name || 'Unknown User'
      });
    } catch (error) {
      logger.error('Failed to publish collaborator invited event:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully',
      invitationId: result.insertedId.toString(),
      emailSent,
    });

  } catch (error) {
    logger.error('Error sending invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get pending invitations for a board
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');

    if (!boardId) {
      return NextResponse.json(
        { error: 'Board ID is required' },
        { status: 400 }
      );
    }

    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Connect to database
    const db = await connectToDatabase();

    // Verify user has access to this board
    const board = await db.collection('boards').findOne(
      { _id: new ObjectId(boardId) },
      { projection: { createdBy: 1, collaborators: 1 } }
    );

    if (!board) {
      return NextResponse.json(
        { error: 'Board not found' },
        { status: 404 }
      );
    }

    const isOwner = board.createdBy.toString() === session.user.id;
    const isCollaborator = board.collaborators?.some(
      (collab: BoardCollaborator) => collab.id === session.user.id
    );

    if (!isOwner && !isCollaborator) {
      return NextResponse.json(
        { error: 'Not authorized to view invitations for this board' },
        { status: 403 }
      );
    }

    // Get pending invitations
    const invitations = await db.collection('board_invitations')
      .find({ 
        boardId: new ObjectId(boardId),
        status: 'pending',
        expiresAt: { $gt: new Date() }
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Convert MongoDB _id to string for frontend compatibility
    const serializedInvitations = invitations.map(invitation => ({
      ...invitation,
      id: invitation._id.toString(),
      boardId: invitation.boardId.toString(),
      inviterUserId: invitation.inviterUserId.toString(),
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      invitationToken: invitation.invitationToken // Ensure token is included
    }));

    return NextResponse.json({ invitations: serializedInvitations });

  } catch (error) {
    logger.error('Error fetching invitations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Revoke/delete invitation (by board owner)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitationId, boardId } = body;
    
    // Enhanced validation with detailed logging
    if (!invitationId || !boardId) {
      logger.warn('DELETE invitation request missing required fields:', {
        hasInvitationId: !!invitationId,
        hasBoardId: !!boardId,
        body
      });
      return NextResponse.json(
        { error: 'Invitation ID and Board ID are required' },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(invitationId) || !ObjectId.isValid(boardId)) {
      logger.warn('DELETE invitation request with invalid ObjectId format:', {
        invitationId,
        boardId,
        invitationIdValid: ObjectId.isValid(invitationId),
        boardIdValid: ObjectId.isValid(boardId)
      });
      return NextResponse.json(
        { error: 'Invalid invitation ID or board ID format' },
        { status: 400 }
      );
    }

    // Get session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Connect to database
    const db = await connectToDatabase();

    // First, get the invitation to verify it exists and belongs to the board
    const invitation = await db.collection('board_invitations').findOne({
      _id: new ObjectId(invitationId),
      boardId: new ObjectId(boardId),
      status: 'pending',
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or already processed' },
        { status: 404 }
      );
    }

    // Verify board ownership
    const board = await db.collection('boards').findOne({ _id: new ObjectId(boardId) });
    if (!board) {
      return NextResponse.json(
        { error: 'Board not found' },
        { status: 404 }
      );
    }
    
    if (board.createdBy.toString() !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the board owner can revoke invitations' },
        { status: 403 }
      );
    }

    // Delete the invitation
    const result = await db.collection('board_invitations').deleteOne({
      _id: new ObjectId(invitationId),
      boardId: new ObjectId(boardId),
      status: 'pending',
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to revoke invitation' },
        { status: 500 }
      );
    }

    // Publish real-time notification
    try {
      pubSub.publish('invitationStatusChanged', boardId, {
        invitationId,
        status: 'revoked',
        email: invitation.inviteeEmail,
      });
    } catch (error) {
      logger.error('Failed to publish invitation revoked event:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation revoked successfully',
      invitationId,
    });
  } catch (error) {
    logger.error('Error revoking invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
