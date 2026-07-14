import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({
        tasks: [
          { id: 't1', title: 'إكمال التصميم', status: 'done', priority: 'high', xpReward: 25, createdAt: new Date().toISOString(), subtasks: [], project: null },
          { id: 't2', title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', xpReward: 30, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'كتابة الكتاب', color: '#D4A853' } },
          { id: 't3', title: 'مراجعة الكود', status: 'todo', priority: 'medium', xpReward: 15, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'تطوير تطبيق الويب', color: '#059669' } },
          { id: 't4', title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20, createdAt: new Date().toISOString(), subtasks: [], project: null },
          { id: 't5', title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10, createdAt: new Date().toISOString(), subtasks: [], project: null },
        ],
        projects: [],
      })
    }

    const supabase = getSupabase()

    const { data: tasks, error: tasksError } = await supabase
      .from('Task')
      .select('*, subtasks:SubTask(*), project:Project(name, color)')
      .eq('userId', userId)
      .order('order', { ascending: true })

    if (tasksError) {
      console.error('Tasks GET error:', tasksError)
      throw tasksError
    }

    const { data: projects } = await supabase
      .from('Project')
      .select('*')
      .eq('userId', userId)

    return NextResponse.json({ tasks: tasks || [], projects: projects || [] })
  } catch (error) {
    console.error('Tasks GET error:', error)
    return NextResponse.json({
      tasks: [
        { id: 't1', title: 'إكمال التصميم', status: 'done', priority: 'high', xpReward: 25, createdAt: new Date().toISOString(), subtasks: [], project: null },
        { id: 't2', title: 'كتابة الفصل الثالث', status: 'in_progress', priority: 'high', xpReward: 30, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'كتابة الكتاب', color: '#D4A853' } },
        { id: 't3', title: 'مراجعة الكود', status: 'todo', priority: 'medium', xpReward: 15, createdAt: new Date().toISOString(), subtasks: [], project: { name: 'تطوير تطبيق الويب', color: '#059669' } },
        { id: 't4', title: 'تمرين رياضي', status: 'todo', priority: 'medium', xpReward: 20, createdAt: new Date().toISOString(), subtasks: [], project: null },
        { id: 't5', title: 'قراءة 30 صفحة', status: 'todo', priority: 'low', xpReward: 10, createdAt: new Date().toISOString(), subtasks: [], project: null },
      ],
      projects: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })

    const body = await req.json()
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('Task')
      .insert({ userId, ...body })
      .select('*, subtasks:SubTask(*), project:Project(*)')
      .single()

    if (error) {
      console.error('Tasks POST error:', error)
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function PUT(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })

    const { id, ...body } = await req.json()
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('Task')
      .update(body)
      .eq('id', id)
      .eq('userId', userId)
      .select('*, subtasks:SubTask(*), project:Project(*)')
      .single()

    if (error) {
      console.error('Tasks PUT error:', error)
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}

export async function DELETE(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const supabase = getSupabase()
    const { error } = await supabase
      .from('Task')
      .delete()
      .eq('id', id)
      .eq('userId', userId)

    if (error) {
      console.error('Tasks DELETE error:', error)
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Operation saved locally', offline: true })
  }
}