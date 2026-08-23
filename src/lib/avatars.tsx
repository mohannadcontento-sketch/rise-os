import React from 'react'

export interface AvatarItem {
  id: string
  name: string
  style: React.CSSProperties
  svg: React.ReactNode
}

export const AVATARS: AvatarItem[] = [
  // ── Nature: Forest ──
  {
    id: 'forest-1',
    name: 'غابة',
    style: { background: 'linear-gradient(135deg, #059669, #064e3b)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 4L6 14H10L7 22H21L18 14H22L14 4Z" fill="white" opacity="0.9" />
        <rect x="12" y="20" width="4" height="4" rx="1" fill="white" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'forest-2',
    name: 'أشجار',
    style: { background: 'linear-gradient(135deg, #16a34a, #14532d)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="16" r="5" fill="white" opacity="0.7" />
        <circle cx="19" cy="14" r="6" fill="white" opacity="0.5" />
        <rect x="8" y="21" width="2" height="4" fill="white" opacity="0.6" />
        <rect x="18" y="20" width="2" height="5" fill="white" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'forest-3',
    name: 'صنوبر',
    style: { background: 'linear-gradient(135deg, #047857, #022c22)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="14,3 5,14 9,14 7,22 21,22 19,14 23,14" fill="white" opacity="0.85" />
      </svg>
    ),
  },

  // ── Ocean ──
  {
    id: 'ocean-1',
    name: 'محيط',
    style: { background: 'linear-gradient(135deg, #0891b2, #164e63)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 16Q8 12 12 16Q16 20 20 16Q24 12 28 16" stroke="white" strokeWidth="2" opacity="0.8" />
        <path d="M2 20Q6 16 10 20Q14 24 18 20Q22 16 26 20" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'ocean-2',
    name: 'موجة',
    style: { background: 'linear-gradient(135deg, #06b6d4, #155e75)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 14C6 10 10 18 14 14C18 10 22 18 25 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        <circle cx="20" cy="8" r="2" fill="white" opacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'ocean-3',
    name: 'أعماق',
    style: { background: 'linear-gradient(135deg, #0e7490, #083344)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="14" r="3" fill="white" opacity="0.3" />
        <circle cx="20" cy="10" r="2" fill="white" opacity="0.5" />
        <path d="M5 20Q10 17 15 20Q20 23 25 20" stroke="white" strokeWidth="1.5" opacity="0.6" />
      </svg>
    ),
  },

  // ── Sunset ──
  {
    id: 'sunset-1',
    name: 'غروب',
    style: { background: 'linear-gradient(135deg, #f59e0b, #dc2626)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="12" r="5" fill="white" opacity="0.9" />
        <line x1="6" y1="20" x2="22" y2="20" stroke="white" strokeWidth="2" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'sunset-2',
    name: 'شفق',
    style: { background: 'linear-gradient(135deg, #ea580c, #9f1239)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="10" r="4" fill="white" opacity="0.8" />
        <path d="M3 18Q7 15 11 18Q15 21 19 18Q23 15 27 18" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'sunset-3',
    name: 'نار',
    style: { background: 'linear-gradient(135deg, #ef4444, #7f1d1d)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 4C14 4 8 12 8 16C8 19.3 10.7 22 14 22C17.3 22 20 19.3 20 16C20 12 14 4 14 4Z" fill="white" opacity="0.85" />
      </svg>
    ),
  },

  // ── Mountain ──
  {
    id: 'mountain-1',
    name: 'جبل',
    style: { background: 'linear-gradient(135deg, #64748b, #1e293b)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="4,22 12,8 16,14 22,6 26,22" fill="white" opacity="0.8" />
        <polygon points="18,22 22,14 26,22" fill="white" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'mountain-2',
    name: 'قمة',
    style: { background: 'linear-gradient(135deg, #78716c, #292524)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="14,4 4,22 24,22" fill="white" opacity="0.7" />
        <polygon points="14,10 10,20 18,20" fill="white" opacity="0.3" />
      </svg>
    ),
  },

  // ── Sky ──
  {
    id: 'sky-1',
    name: 'سحاب',
    style: { background: 'linear-gradient(135deg, #0ea5e9, #0c4a6e)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="12" cy="12" rx="6" ry="4" fill="white" opacity="0.7" />
        <ellipse cx="18" cy="13" rx="5" ry="3.5" fill="white" opacity="0.6" />
        <ellipse cx="15" cy="15" rx="8" ry="3" fill="white" opacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'sky-2',
    name: 'نجوم',
    style: { background: 'linear-gradient(135deg, #1e1b4b, #0f172a)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="1.2" fill="white" opacity="0.9" />
        <circle cx="18" cy="5" r="1" fill="white" opacity="0.7" />
        <circle cx="22" cy="12" r="1.5" fill="white" opacity="0.6" />
        <circle cx="10" cy="18" r="1" fill="white" opacity="0.8" />
        <circle cx="20" cy="20" r="0.8" fill="white" opacity="0.5" />
        <circle cx="5" cy="14" r="0.8" fill="white" opacity="0.6" />
      </svg>
    ),
  },

  // ── Sun / Moon ──
  {
    id: 'sun-1',
    name: 'شمس',
    style: { background: 'linear-gradient(135deg, #fbbf24, #b45309)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="5" fill="white" opacity="0.9" />
        <line x1="14" y1="3" x2="14" y2="6" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <line x1="14" y1="22" x2="14" y2="25" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <line x1="3" y1="14" x2="6" y2="14" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <line x1="22" y1="14" x2="25" y2="14" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <line x1="6" y1="6" x2="8" y2="8" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="20" y1="20" x2="22" y2="22" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="6" y1="22" x2="8" y2="20" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="20" y1="8" x2="22" y2="6" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'moon-1',
    name: 'قمر',
    style: { background: 'linear-gradient(135deg, #a78bfa, #3b0764)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6C12 6 7 11 7 17C7 20 8.5 22.5 10.5 24C6.5 22.5 4 18.5 4 14C4 7.4 9.4 2 16 2C18.5 2 20.8 2.8 22.5 4.2C21.2 5 19.6 5.5 18 6Z" fill="white" opacity="0.85" />
        <circle cx="21" cy="8" r="1" fill="white" opacity="0.5" />
        <circle cx="18" cy="12" r="0.7" fill="white" opacity="0.4" />
      </svg>
    ),
  },

  // ── Gold / Amber ──
  {
    id: 'gold-1',
    name: 'ذهبي',
    style: { background: 'linear-gradient(135deg, #f59e0b, #78350f)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="14,3 17,11 26,11 19,16 21,25 14,20 7,25 9,16 2,11 11,11" fill="white" opacity="0.85" />
      </svg>
    ),
  },
  {
    id: 'gold-2',
    name: 'تاج',
    style: { background: 'linear-gradient(135deg, #d97706, #451a03)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 18L7 10L11 14L14 6L17 14L21 10L24 18Z" fill="white" opacity="0.85" />
        <rect x="4" y="18" width="20" height="4" rx="1" fill="white" opacity="0.6" />
      </svg>
    ),
  },

  // ── Abstract ──
  {
    id: 'abstract-1',
    name: 'حلقات',
    style: { background: 'linear-gradient(135deg, #10b981, #065f46)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="8" stroke="white" strokeWidth="2" fill="none" opacity="0.7" />
        <circle cx="14" cy="14" r="4" stroke="white" strokeWidth="2" fill="none" opacity="0.9" />
        <circle cx="14" cy="14" r="1" fill="white" opacity="1" />
      </svg>
    ),
  },
  {
    id: 'abstract-2',
    name: 'ماسي',
    style: { background: 'linear-gradient(135deg, #14b8a6, #134e4a)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="14,4 22,12 14,24 6,12" fill="white" opacity="0.7" />
        <line x1="8" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: 'abstract-3',
    name: 'هندسي',
    style: { background: 'linear-gradient(135deg, #8b5cf6, #4c1d95)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="8" height="8" fill="white" opacity="0.6" />
        <rect x="14" y="14" width="8" height="8" fill="white" opacity="0.4" />
        <rect x="6" y="14" width="8" height="8" fill="white" opacity="0.3" />
        <rect x="14" y="6" width="8" height="8" fill="white" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'abstract-4',
    name: 'موجات',
    style: { background: 'linear-gradient(135deg, #ec4899, #831843)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 10C6 6 10 14 14 10C18 6 22 14 26 10" stroke="white" strokeWidth="2" opacity="0.7" />
        <path d="M2 16C6 12 10 20 14 16C18 12 22 20 26 16" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <path d="M2 22C6 18 10 26 14 22C18 18 22 26 26 22" stroke="white" strokeWidth="1" opacity="0.3" />
      </svg>
    ),
  },

  // ── Earth ──
  {
    id: 'earth-1',
    name: 'أرض',
    style: { background: 'linear-gradient(135deg, #22c55e, #14532d)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="10" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5" />
        <ellipse cx="14" cy="14" rx="4" ry="10" stroke="white" strokeWidth="1" fill="none" opacity="0.4" />
        <line x1="4" y1="10" x2="24" y2="10" stroke="white" strokeWidth="1" opacity="0.3" />
        <line x1="4" y1="18" x2="24" y2="18" stroke="white" strokeWidth="1" opacity="0.3" />
      </svg>
    ),
  },

  // ── Desert ──
  {
    id: 'desert-1',
    name: 'صحراء',
    style: { background: 'linear-gradient(135deg, #d97706, #92400e)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="8" r="4" fill="white" opacity="0.8" />
        <path d="M2 20Q8 16 14 20Q20 24 26 20" stroke="white" strokeWidth="2" opacity="0.5" />
        <path d="M2 24Q10 20 18 24Q22 26 28 24" stroke="white" strokeWidth="1.5" opacity="0.3" />
      </svg>
    ),
  },

  // ── Rose ──
  {
    id: 'rose-1',
    name: 'وردة',
    style: { background: 'linear-gradient(135deg, #f43f5e, #881337)' },
    svg: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 6C14 6 8 10 8 16C8 19.3 10.7 22 14 22C17.3 22 20 19.3 20 16C20 10 14 6 14 6Z" fill="white" opacity="0.7" />
        <path d="M14 10C14 10 11 13 11 16C11 17.7 12.3 19 14 19" stroke="white" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  },
]