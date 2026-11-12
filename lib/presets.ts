export interface StorePreset {
  name: string;
  url: string;
  category: string;
  contactEmail?: string;
  notes?: string;
}

export const DEFAULT_STORES: StorePreset[] = [
  { name: "Beardbrand", url: "https://www.beardbrand.com", category: "Grooming & Men's Care", contactEmail: "support@beardbrand.com" },
  { name: "Taza Chocolate", url: "https://www.tazachocolate.com", category: "Food & Organic Cacao", contactEmail: "orders@tazachocolate.com" },
  { name: "Hiut Denim", url: "https://hiutdenim.co.uk", category: "Apparel & Artisan Denim" },
  { name: "United By Blue", url: "https://unitedbyblue.com", category: "Outdoor & Sustainable", contactEmail: "hello@unitedbyblue.com" },
  { name: "Conscious Clothing", url: "https://consciousclothing.net", category: "Eco Fashion & Linen" },
  { name: "Asket", url: "https://asket.com", category: "Minimalist Essentials", contactEmail: "care@asket.com" },
  { name: "Afends", url: "https://afends.com", category: "Streetwear & Hemp Wear" },
  { name: "UpCircle Beauty", url: "https://upcirclebeauty.com", category: "Circular Skincare", contactEmail: "hello@upcirclebeauty.com" },
  { name: "Tropic Skincare", url: "https://tropic.com", category: "Clean Skincare" },
];

export const TONE_LABELS: Record<string, { label: string; description: string; badge: string }> = {
  sharp_3_sentence: {
    label: "Waitlist & Restock Alert (Recommended)",
    description: "Casual 3-4 sentence cold email offering a Back-in-Stock notification or Pre-Order setup so visitor traffic isn't wasted.",
    badge: "Highest Conversion",
  },
  preorder_recovery: {
    label: "Pre-Order Concierge",
    description: "Focus on capturing immediate orders with a pre-order system so shopper intent isn't wasted.",
    badge: "Direct Sales",
  },
  revenue_leak_executive: {
    label: "Traffic Loss to Waitlist",
    description: "Direct founder/executive outreach offering to prevent traffic bounce on OOS pages by collecting customer emails.",
    badge: "High Intent",
  },
  phantom_inventory_specialist: {
    label: "VIP Restock Lead Capture",
    description: "Offer to set up a seamless restock SMS/email notification system on high-demand products.",
    badge: "List Builder",
  },
  linkedin_inmail: {
    label: "Casual Founder DM",
    description: "Ultra-concise peer-to-peer message under 60 words offering frictionless waitlist setup.",
    badge: "Direct DM",
  },
  loom_video_script: {
    label: "60s Loom Video Script",
    description: "Concise async video script walking through their live OOS product page and offering setup.",
    badge: "Video Pitch",
  },
};



