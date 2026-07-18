import { NextRequest, NextResponse } from 'next/server'

const TOOLS = [
  {
    name: 'list_tools',
    description: 'عرض قائمة الأدوات المتاحة',
    args: [],
  },
  {
    name: 'get_dashboard',
    description: 'عرض لوحة التحكم الرئيسية',
    args: [],
  },
  {
    name: 'get_tasks',
    description: 'عرض قائمة المهام',
    args: [{ name: 'status', type: 'string', required: false, description: 'فلتر الحالة: todo, in_progress, done, cancelled' }],
  },
  {
    name: 'add_task',
    description: 'إضافة مهمة جديدة',
    args: [
      { name: 'title', type: 'string', required: true, description: 'عنوان المهمة' },
      { name: 'priority', type: 'string', required: false, description: 'الأولوية: low, medium, high, urgent' },
    ],
  },
  {
    name: 'get_habits',
    description: 'عرض العادات',
    args: [],
  },
  {
    name: 'get_goals',
    description: 'عرض الأهداف',
    args: [],
  },
  {
    name: 'get_journal',
    description: 'عرض يوميات اليوم',
    args: [],
  },
  {
    name: 'get_projects',
    description: 'عرض المشاريع',
    args: [],
  },
  {
    name: 'get_finance',
    description: 'عرض السجلات المالية',
    args: [],
  },
  {
    name: 'get_health',
    description: 'عرض سجلات الصحة',
    args: [],
  },
  {
    name: 'get_focus',
    description: 'عرض جلسات التركيز',
    args: [],
  },
  {
    name: 'get_score',
    description: 'عرض نقاط الإنتاجية',
    args: [],
  },
] as const

// GET: List available tools
export async function GET() {
  return NextResponse.json({ tools: TOOLS })
}

// POST: MCP is deprecated — service unavailable
export async function POST() {
  return NextResponse.json(
    {
      error: 'MCP tool execution is deprecated. Please use the REST API endpoints directly.',
      tools: TOOLS,
    },
    { status: 503 },
  )
}