'use client'

// ============================================================
// admin-broadcast-dialog.tsx — حوار «بث إشعار جماعي»
//
// إرسال إشعار system لكل المستخدمين (أو مستخدم واحد) عبر
// /api/rise/admin/broadcast — النوع system فقط هو المسموح في RPC.
// ============================================================

import { useState } from 'react'

import { Megaphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { toArabicNum } from './admin-panel-utils'


/* ═══════════════ Broadcast Dialog (ADMIN PRO) ═══════════════ */

export function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title.trim() || !body.trim()) return
    setSending(true)
    try {
      const res = await apiFetch('/api/rise/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`تم إرسال الإعلان إلى ${toArabicNum(data.sent || 0)} مستخدم`)
        setTitle('')
        setBody('')
        onOpenChange(false)
      } else {
        toast.error(data?.error || 'فشل الإرسال')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4 text-forest" />
            إعلان لكل المستخدمين
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">سيصل كإشعار 📣 في جرس الإشعارات عند فتح كل مستخدم للتطبيق.</p>
          <Input placeholder="العنوان (مثال: صيانة مجدولة الليلة)" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className="text-sm" dir="rtl" />
          <textarea
            placeholder="نص الإعلان..."
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full rounded-xl neo-input text-sm p-3 min-h-[90px] resize-none bg-transparent"
            dir="rtl"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={send}
            disabled={sending || !title.trim() || !body.trim()}
            className="gap-1.5 bg-forest text-paper-soft hover:bg-forest/90 dark:bg-lime dark:text-ink"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
