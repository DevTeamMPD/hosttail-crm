# ขั้นตอน Merge ลูกค้าที่มาจากคนละ LINE Provider ID

## 1. ทำไมต้อง merge

- LINE `userId` (`line_uid`) **ผูกกับ Provider** ไม่ใช่ channel — คนเดียวกันแต่คนละ Provider จะได้ `line_uid` คนละค่า ไม่เกี่ยวกันเลย
- สมาชิกเดิม 72 คน (`source = 'legacy_sheet'`) ลงทะเบียนผ่าน LINE Login channel ที่อยู่ใน **Provider เก่า** ส่วนแอปปัจจุบันใช้ Provider ของบริษัท
- เมื่อลูกค้าเก่าเปิด LIFF ใหม่ `POST /api/liff/session` จะสร้างแถว `ht_members` **ใหม่** (line_uid ใหม่ ไม่มีประวัติ)
- ต้องย้ายประวัติจากแถวเก่า (loser) มาแถวใหม่ (winner) — **แถวใหม่ชนะเสมอ** เพราะเป็น line_uid ที่ใช้งานได้จริง

> ⚠️ ห้าม merge ทันทีจากการที่ลูกค้าพิมพ์เบอร์โทรตรง — เบอร์โทรเดาได้/ใช้ร่วมกันได้ (เคยเกิดเหตุจริง 2026-09-15 บัญชี dev ดูดข้อมูลลูกค้าจริงไป รวมถึงบัญชี Shopee) ทุกการ merge ต้องผ่านการอนุมัติของ admin

## 2. ภาพรวม Flow

```
ลูกค้าเปิด LIFF (Provider ใหม่) → สร้าง ht_members ใหม่
        │
        ├─ กดปุ่ม "เคยเป็นสมาชิกแล้ว?"  → POST /api/liff/relink  (origin = relink_button)
        └─ ส่งฟอร์มลงทะเบียน เบอร์ตรงกับ legacy → submitRegistration() ขั้น 1b (origin = order_submit)
        │
        ▼
ht_relink_requests (status = pending) + evidence
        │
        ▼
Admin รีวิวที่ Dashboard → /approvals แท็บ "ขอเชื่อมบัญชีเดิม"
        ├─ อนุมัติ → ht_approve_relink_request() → ht_merge_members()
        └─ ปฏิเสธ → ht_reject_relink_request()
```

## 3. ขั้นตอนสำหรับลูกค้า

1. เปิด LIFF ของ Hosttail (ระบบสร้างบัญชีใหม่ให้อัตโนมัติ)
2. กด **"เคยเป็นสมาชิกแล้ว?"** แล้วกรอกเบอร์โทรที่เคยลงทะเบียน หรือกรอกเบอร์เดิมตอนลงทะเบียนประกัน
3. ระบบตอบ `queued` / `already_pending` (ส่งซ้ำไม่สร้างคำขอใหม่) / `not_found`
4. รอ admin อนุมัติ

หมายเหตุ: บัญชีที่ `is_test = true` จะได้ `not_found` เสมอ และไม่สร้างคำขอ

## 4. ขั้นตอนสำหรับ Admin (ต้องมี role `admin`)

1. เข้า **Dashboard → /approvals → แท็บ "ขอเชื่อมบัญชีเดิม"** (แท็บแสดงเมื่อมีคำขอ pending)
2. ตรวจ `evidence` ของคำขอ:

   | field | ความหมาย | น้ำหนัก |
   |---|---|---|
   | `claimant_uid_phone_matches_claim` | line_uid ใหม่ของผู้ขอ ปรากฏใน `order_tracking` (LINE OA, `buyer_account_no`) คู่กับเบอร์ที่อ้าง | **หลักฐานแข็งที่สุด** (LINE ยืนยันเอง) |
   | `claimant_uid_seen_in_order_tracking` | line_uid ผู้ขอเคยสั่งผ่าน LINE OA | ปานกลาง |
   | `other_pending_claims` | มีคนอื่นขอ legacy คนเดียวกันอยู่ | **> 0 = ต้องระวังมาก** |
   | `legacy_name`, `legacy_points`, `legacy_registered_at`, `legacy_registration_count` | ข้อมูลบัญชีเก่า | ใช้เทียบกับชื่อ/โปรไฟล์ผู้ขอ |

3. ถ้าหลักฐานไม่พอ: ติดต่อลูกค้ายืนยันเพิ่ม (เช่น ชื่อ-นามสกุล, เลขออเดอร์เก่า, รูปใบเสร็จ)
4. กด **อนุมัติ** (`approveRelink`) หรือ **ปฏิเสธ** พร้อมเหตุผล (`rejectRelink`)

## 5. สิ่งที่เกิดขึ้นเมื่ออนุมัติ (`ht_merge_members`)

ทำใน transaction เดียว ล็อกทั้งสองแถว (`for update`):

| ข้อมูล | การจัดการ |
|---|---|
| `ht_warranty_registrations` | ย้าย `member_id` → winner |
| `ht_warranty_items` | ย้าย `member_id` → winner (นับ 365 วันต่อเนื่อง) |
| `ht_points_ledger` | **ไม่ย้าย** (append-only) — เพิ่มรายการ `adjust` 1 แถวให้ winner เท่ากับ `points_balance` ของ loser |
| `ht_member_consents` | **ไม่คัดลอก** — winner ให้ consent ใหม่เองตอนลงทะเบียน |
| loser (`ht_members`) | `status = 'merged'`, `merged_into = winner` |
| `ht_member_merges` | บันทึก winner, loser, reason, ผู้ทำ, จำนวนแถวที่ย้าย (`moved_rows`) |
| `ht_relink_requests` | คำขอนี้ → `approved` + `merge_id`; คำขออื่นของ legacy คนเดียวกัน → `superseded` |

ข้อป้องกัน: merge ตัวเองไม่ได้, merge แถวที่ `merged` แล้วไม่ได้, คำขอที่ไม่ใช่ `pending` อนุมัติไม่ได้

## 6. Merge ด้วยมือ (กรณีพิเศษ ผ่าน SQL)

ใช้เมื่อไม่มีคำขอในระบบ เช่น ลูกค้าติดต่อผ่าน call center — **ควรสร้างคำขอแล้วอนุมัติผ่านหน้า approvals มากกว่า** เพื่อให้มี audit trail ครบ

```sql
-- 1) หาแถวทั้งสอง
select id, source, status, line_uid, full_name, phone, points_balance
from ht_members
where phone = '0812345678';   -- เบอร์รูปแบบ normalize แล้ว

-- 2) ตรวจว่า loser ยัง active และไม่ได้ถูกคนอื่นขออยู่
select * from ht_relink_requests where legacy_member_id = '<legacy_id>' and status = 'pending';

-- 3) merge (winner = แถวใหม่จาก LIFF, loser = แถว legacy)
select ht_merge_members('<new_member_id>', '<legacy_id>', 'manual_admin_<ticket>', '<staff_id>');

-- 4) ตรวจผล
select * from ht_member_merges where loser_id = '<legacy_id>';
select status, merged_into from ht_members where id = '<legacy_id>';
```

## 7. ตรวจว่า Provider ตรงกันหรือไม่

```bash
npx tsx scripts/check-line-provider.ts
```

- Probe A: `buyer_account_no` ของ `LOA_hosttail` resolve ได้กับ Messaging API channel ของเราหรือไม่
- Probe B: `line_uid` จาก LIFF Login channel อยู่ Provider เดียวกับ Messaging API หรือไม่
- `200` = ตรงกัน, `404` = สรุปไม่ได้ (คนละ Provider หรือยังไม่ได้เพิ่มเพื่อน OA)
- ต้องตั้ง `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env.local`

## 8. การย้อนกลับ (Unmerge)

ไม่มีฟังก์ชันอัตโนมัติ ต้องทำด้วยมือโดยอ้างอิง `ht_member_merges.moved_rows`:

1. ย้าย `ht_warranty_registrations` / `ht_warranty_items` กลับไป loser (ระบุแถวที่เป็นของ loser เดิม)
2. เพิ่มรายการ `adjust` ติดลบใน `ht_points_ledger` ของ winner เพื่อหักแต้มที่ยกมา (ห้ามลบ/แก้ ledger)
3. ตั้ง loser `status = 'active'`, `merged_into = null`
4. ตรวจ `ht_member_platform_accounts` (เช่น บัญชี Shopee) ที่อาจถูกผูกกับ winner หลัง merge
5. บันทึกเหตุผลใน `ht_audit_log`

> ยิ่งปล่อยนาน ยิ่งแก้ยาก — เมื่อ cron auto-attribution ทำงาน แต้ม/ประกันจากออเดอร์ใหม่จะสะสมเข้าบัญชีผิดทุกคืน

## อ้างอิง

- `supabase/migrations/20260915101500_ht_merge_members.sql`
- `supabase/migrations/20260915103000_ht_relink_requests.sql`
- `src/lib/orders/relink.ts`, `src/lib/orders/submit.ts`
- `src/app/(dashboard)/approvals/actions.ts`
- `scripts/check-line-provider.ts`
