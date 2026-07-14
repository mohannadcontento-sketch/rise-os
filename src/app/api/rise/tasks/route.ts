import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseWithAuth } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req)
    if (!userId) {
      return NextResponse.json({ tasks: [], projects: [] })
    }

    const supabase = getSupabaseWithAuth(req)

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
    return NextResponse.json({ tasks: [], projects: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
        const userId = await requireAuth(req)
    if (!userId) return NextResponse.json({ error: "unauthorized", offline: true }, { status: 401 })

    const body = await req.json()
    const supabase = getSupabaseWithAuth(req)

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
    const supabase = getSupabaseWithAuth(req)

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

    const supabase = getSupabaseWithAuth(req)
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