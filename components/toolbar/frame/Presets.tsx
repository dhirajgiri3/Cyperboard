import {
    Smartphone,
    Tablet,
    Monitor,
    Instagram,
    Globe,
    Briefcase,
    File,
    Copy,
  } from "lucide-react";
  import { FramePreset } from "./types";
  
  export const framePresets: FramePreset[] = [
    // Device Frames
    {
      id: "iphone-15-pro",
      name: "iPhone 15 Pro",
      category: "device",
      dimensions: { width: 393, height: 852 },
      aspectRatio: 393 / 852,
      icon: <Smartphone size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 2,
        cornerRadius: 24,
        shadow: {
          blur: 12,
          color: "#00000020",
          offsetX: 0,
          offsetY: 4,
          opacity: 0.25,
        },
      },
      description: "iPhone 15 Pro screen dimensions with Dynamic Island",
      tags: ["mobile", "ios", "apple", "phone", "responsive"],
    },
    {
      id: "ipad-pro-12-9",
      name: "iPad Pro 12.9\"",
      category: "device",
      dimensions: { width: 1024, height: 1366 },
      aspectRatio: 1024 / 1366,
      icon: <Tablet size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 2,
        cornerRadius: 12,
        shadow: {
          blur: 12,
          color: "#00000020",
          offsetX: 0,
          offsetY: 4,
          opacity: 0.25,
        },
      },
      description: "iPad Pro 12.9-inch display",
      tags: ["tablet", "ios", "apple", "responsive"],
    },
    {
      id: "macbook-pro",
      name: "MacBook Pro 16\"",
      category: "device",
      dimensions: { width: 1440, height: 900 },
      aspectRatio: 1440 / 900,
      icon: <Monitor size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 2,
        cornerRadius: 8,
        shadow: {
          blur: 12,
          color: "#00000020",
          offsetX: 0,
          offsetY: 4,
          opacity: 0.25,
        },
      },
      description: "MacBook Pro 16-inch retina display",
      tags: ["laptop", "macos", "apple", "desktop"],
    },
    // Social Media Frames
    {
      id: "instagram-post",
      name: "Instagram Post",
      category: "social",
      dimensions: { width: 1080, height: 1080 },
      aspectRatio: 1,
      icon: <Instagram size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 0,
        cornerRadius: 0,
      },
      description: "Square post for Instagram feed",
      tags: ["social", "instagram", "square", "post"],
    },
    {
      id: "instagram-story",
      name: "Instagram Story",
      category: "social",
      dimensions: { width: 1080, height: 1920 },
      aspectRatio: 1080 / 1920,
      icon: <Instagram size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 0,
        cornerRadius: 0,
      },
      description: "Vertical story format for Instagram",
      tags: ["social", "instagram", "story", "vertical"],
    },
    {
      id: "web-desktop",
      name: "Desktop Web",
      category: "web",
      dimensions: { width: 1440, height: 900 },
      aspectRatio: 1440 / 900,
      icon: <Globe size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 1,
        cornerRadius: 4,
      },
      description: "Standard desktop web layout",
      tags: ["web", "desktop", "browser"],
    },
    // Presentation Frames
    {
      id: "slide-16-9",
      name: "Slide 16:9",
      category: "presentation",
      dimensions: { width: 1920, height: 1080 },
      aspectRatio: 16 / 9,
      icon: <Monitor size={16} />,
      frameType: "presentation",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 0,
        cornerRadius: 0,
      },
      description: "Widescreen presentation slide",
      tags: ["presentation", "slide", "widescreen"],
    },
    {
      id: "a4-portrait",
      name: "A4 Portrait",
      category: "print",
      dimensions: { width: 595, height: 842 },
      aspectRatio: 595 / 842,
      icon: <File size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 1,
        cornerRadius: 0,
      },
      description: "Standard A4 paper in portrait orientation",
      tags: ["print", "a4", "document"],
    },
    {
      id: "custom-frame",
      name: "Custom Frame",
      category: "custom",
      dimensions: { width: 400, height: 300 },
      icon: <Copy size={16} />,
      frameType: "design",
      defaultStyle: {
        fill: "#ffffff",
        stroke: "#e5e7eb",
        strokeWidth: 2,
        cornerRadius: 8,
      },
      description: "Customizable frame dimensions",
      tags: ["custom", "flexible"],
    },
  ];
  
  import type { FrameCategory, CategoryInfo } from "./types";

export const categoryInfo: Record<FrameCategory, CategoryInfo> = {
  device: {
    label: "Devices",
    icon: <Smartphone size={16} />,
    color: "bg-blue-100 text-blue-700",
    description: "Mobile phones, tablets, and desktop screens",
  },
  social: {
    label: "Social Media",
    icon: <Instagram size={16} />,
    color: "bg-pink-100 text-pink-700",
    description: "Social media post formats and stories",
  },
  web: {
    label: "Web Design",
    icon: <Globe size={16} />,
    color: "bg-purple-100 text-purple-700",
    description: "Web page layouts and banner formats",
  },
  presentation: {
    label: "Presentations",
    icon: <Monitor size={16} />,
    color: "bg-green-100 text-green-700",
    description: "Slide decks and presentation formats",
  },
  print: {
    label: "Print",
    icon: <File size={16} />,
    color: "bg-orange-100 text-orange-700",
    description: "Print materials and documents",
  },
  custom: {
    label: "Custom",
    icon: <Copy size={16} />,
    color: "bg-gray-100 text-gray-700",
    description: "Custom frame configurations",
  },
};
  
  export const colorPresets = [
    { id: "white", color: "#ffffff", name: "White", category: "neutral" },
    { id: "light-gray", color: "#f9fafb", name: "Light Gray", category: "neutral" },
    { id: "gray", color: "#e5e7eb", name: "Gray", category: "neutral" },
    { id: "dark-gray", color: "#6b7280", name: "Dark Gray", category: "neutral" },
    { id: "black", color: "#000000", name: "Black", category: "neutral" },
    { id: "blue", color: "#3b82f6", name: "Blue", category: "primary" },
    { id: "red", color: "#ef4444", name: "Red", category: "primary" },
    { id: "green", color: "#22c55e", name: "Green", category: "primary" },
    { id: "yellow", color: "#eab308", name: "Yellow", category: "primary" },
    { id: "purple", color: "#a855f7", name: "Purple", category: "primary" },
  ];