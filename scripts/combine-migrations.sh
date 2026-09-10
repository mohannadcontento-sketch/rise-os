#!/bin/bash
# RiseOS — دمج مهاجرات Supabase 013→022 في ملف واحد مرتّب لتنفيذها مرة واحدة
# المصدر: supabase/migrations/ (نفس الملفات حرفياً — بدون تعديل محتوى)
OUT="/home/z/my-project/download/riseos-supabase-migrations-013-to-022.sql"
echo "-- ============================================================" > "$OUT"
echo "-- RiseOS — Security Hardening Migrations 013 → 022 (combined)" >> "$OUT"
echo "-- نفّذ هذا الملف مرة واحدة في Supabase SQL Editor قبل/بعد نشر الكود" >> "$OUT"
echo "-- الترتيب داخلياً مطابق للترتيب الأصلي. لا يحتاج تعديل." >> "$OUT"
echo "-- ============================================================" >> "$OUT"
for f in /home/z/my-project/supabase/migrations/0[12]*.sql; do
  base=$(basename "$f")
  case "$base" in
    013*|014*|015*|016*|017*|018*|019*|020*|021*|022*)
      echo "" >> "$OUT"
      echo "-- >>> BEGIN $base <<<" >> "$OUT"
      cat "$f" >> "$OUT"
      echo "" >> "$OUT"
      echo "-- >>> END $base <<<" >> "$OUT"
      ;;
  esac
done
echo "written: $OUT ($(wc -l < "$OUT") lines)"
