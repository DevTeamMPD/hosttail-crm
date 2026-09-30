# Order Merge & Platform Account Binding

สเปกนี้ใช้ได้กับทุกโปรเจกต์ ครอบคลุม 3 เรื่อง:
1. **ผูก Order** — เชื่อมออเดอร์ที่ลูกค้ากรอก (เลขออเดอร์ หรือเบอร์โทร) กับออเดอร์จริงในระบบขาย
2. **ผูกบัญชี Platform** — เชื่อมบัญชีผู้ซื้อบน Shopee / Lazada / TikTok / FB / LINE เข้ากับ `uid` สมาชิก เพื่อให้ออเดอร์ครั้งต่อไปถูกนับให้สมาชิกเองอัตโนมัติ
3. **รวมสมาชิก (Relink/Merge)** — รวมประวัติของบัญชีสมาชิกเก่าเข้ากับบัญชีใหม่ โดยให้แอดมินอนุมัติ

> ต้นแบบคือ Hosttail CRM (`src/lib/orders/*`, `supabase/migrations/20260915102000_*`, `20260915103000_*`, `20260915101500_*`)
> ชื่อตารางด้านล่างเป็นชื่อกลาง ๆ ให้เปลี่ยนตาม schema ของแต่ละโปรเจกต์

---

## 0. หลักการที่ห้ามละเมิด

| # | กฎ | เหตุผล |
|---|----|--------|
| 1 | `member_id` ต้องมาจาก session ที่ยืนยันแล้ว (เช่น LINE ID token ที่ verify ฝั่ง server) **ไม่รับจาก request body เด็ดขาด** | ถ้ารับจาก body ใครก็ปลอมตัวเป็นคนอื่นได้ |
| 2 | **เลขออเดอร์เป็นหลักฐานได้ แต่เบอร์โทรไม่ใช่** เบอร์โทรเดาได้และมีคนใช้ร่วมกัน | ใช้เบอร์ค้นออเดอร์ได้ก็ต่อเมื่อเบอร์นั้นตรงกับเบอร์ในโปรไฟล์ของสมาชิกเอง |
| 3 | จะผูกบัญชี platform ได้ **ก็ต่อเมื่อออเดอร์ verify แล้วเท่านั้น** (เจอในระบบขาย หรือแอดมินอนุมัติ) | การผูกหนึ่งครั้งมีผลกับ*ทุกออเดอร์ในอนาคต*ของบัญชีนั้น จึงต้องมีหลักฐานมากกว่าออเดอร์เดียว |
| 4 | บัญชี platform หนึ่งบัญชีมี **เจ้าของ active ได้ครั้งละหนึ่งคน** (บังคับด้วย unique index ใน DB) | กันไม่ให้สองคนเคลมสตรีมออเดอร์เดียวกัน |
| 5 | **ห้ามย้ายเจ้าของบัญชีเงียบ ๆ** ถ้ามีคนอื่นถืออยู่แล้วให้บันทึก audit แล้วส่งให้แอดมินตัดสิน | |
| 6 | **ห้าม auto-merge สมาชิกเพราะเบอร์ตรงกัน** ให้สร้างคำขอ (request) แล้วรอแอดมินอนุมัติ | เคยเกิดใน production: การกดทดสอบครั้งเดียวดูดบัญชีลูกค้าจริงรวมถึงบัญชี Shopee ของเขาไปด้วย |
| 7 | บัญชีทดสอบ (`is_test`) **ห้ามผูกบัญชี platform และห้ามเคลมสมาชิกเก่า** | การผูกเป็น global จะเบี่ยงออเดอร์ของลูกค้าจริง |
| 8 | การผูกบัญชีเป็นส่วนเสริม **ต้องไม่ throw และต้องไม่ rollback** การลงทะเบียน/คะแนนที่ commit ไปแล้ว | |

---

## 1. Data Model

### แหล่งข้อมูลภายนอก (อ่านอย่างเดียว)

| ตาราง | คอลัมน์ที่ใช้ | ความหมาย |
|-------|------------|----------|
| `sales_transaction` | `bill_no`, `order_no`, `sku`, `product_name`, `quantity`, `amount`, `order_status`, `txn_date`, `transfer_date`, `project`, `keyword` | ระบบขาย/ERP แถวละหนึ่ง line item โดย `bill_no` = เลขออเดอร์ที่ลูกค้าเห็นบน platform และ `order_no` = เลขภายในของ ERP |
| `order_tracking` | `shop`, `online_order`, `buyer_account_no`, `buyer_name`, `phone`, `tracking_number` | ข้อมูลจาก platform (ETL) ใช้ map จากออเดอร์ไปยังบัญชีผู้ซื้อ |

> `buyer_account_no` เป็นตัวยึด identity ที่ดีกว่าเบอร์โทรมาก เพราะมีข้อมูลครบ 100% ส่วนเบอร์โทรบน Shopee ถูก mask ถึง 98%
> บน LINE OA ค่า `buyer_account_no` คือ LINE `uid` (U + 32 hex)

### ตารางของ CRM

```sql
-- สมาชิก
members(id uuid pk, line_uid text unique, phone text, full_name text,
        source text,            -- 'liff' | 'legacy_sheet' | ...
        status text,            -- 'active' | 'merged'
        is_test boolean default false,
        points_balance int, merged_into uuid null)

-- การลงทะเบียนออเดอร์ (1 แถวต่อ 1 การส่ง)
order_registrations(id uuid pk, member_id uuid fk, channel text,
        order_ref_kind text,    -- 'order_id' | 'phone'
        order_ref_raw text,
        matched_order_no text unique null,  -- กันเคลมออเดอร์ซ้ำ
        link_status text,       -- auto_matched | pending_review | needs_info | not_found
        auto_match_candidates jsonb, status text)   -- 'pending' | 'active'

-- ผูกบัญชี platform ↔ สมาชิก
create table member_platform_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  shop text not null,                 -- 'SH_shop','LA_shop','TT_shop','FB_shop','LOA_shop'
  account_no text not null,
  account_name text,                  -- snapshot ไว้ให้แอดมินดู
  bound_via text not null check (bound_via in ('registration','backfill','admin')),
  source_registration_id uuid references order_registrations(id) on delete set null,
  status text not null default 'active' check (status in ('active','revoked')),
  bound_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid, revoke_reason text,
  constraint mpa_account_shape_chk check (
    length(account_no) between 4 and 64
    and account_no ~ '^[\x21-\x7E]+$'     -- ASCII พิมพ์ได้ ไม่มีช่องว่าง/ภาษาไทย
    and account_no !~ '^(.)\1+$'          -- ไม่ใช่ตัวอักษรซ้ำทั้งหมด เช่น 0000
  ),
  constraint mpa_revoked_chk check (status <> 'revoked' or revoked_at is not null)
);
-- ★ คุณสมบัติความปลอดภัยหลัก: เจ้าของ active ได้คนเดียว
create unique index ux_mpa_account on member_platform_accounts (shop, account_no) where status = 'active';
create index ix_mpa_member on member_platform_accounts (member_id) where status = 'active';

-- คำขอรวมสมาชิก (รอแอดมินอนุมัติ)
create table relink_requests (
  id uuid primary key default gen_random_uuid(),
  claimant_member_id uuid not null references members(id),
  legacy_member_id uuid not null references members(id),
  claimed_phone text not null,
  origin text not null check (origin in ('relink_button','order_submit')),
  evidence jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  reviewed_by uuid, reviewed_at timestamptz, review_note text, merge_id uuid,
  constraint relink_not_self check (claimant_member_id <> legacy_member_id),
  constraint relink_reviewed_chk check (status = 'pending' or reviewed_at is not null)
);
create unique index ux_relink_open on relink_requests (claimant_member_id, legacy_member_id) where status = 'pending';

-- audit_log(actor_id, action, entity, entity_id, before jsonb, after jsonb, created_at)
```

**RLS:** staff อ่านได้ ส่วนการเขียน `member_platform_accounts` ด้วยมือให้เฉพาะ admin ฝั่งลูกค้า (LIFF) เขียนผ่าน service role หลังผ่านการเช็กในโค้ดแล้วเท่านั้น

---

## 2. Normalization

### เลขออเดอร์
```ts
export function normalizeOrderKey(raw?: string | null): string | null {
  if (!raw) return null
  const s = String(raw)
    .replace(/[​-‍﻿]/g, '') // zero-width
    .trim()
    .replace(/^#+\s*/, '')                  // Lazada ลูกค้าชอบวาง '#'
    .replace(/[\s-]/g, '')
    .toUpperCase()
  return s || null
}
```
- **ห้ามตัดเลข 0 นำหน้า** เพราะเลขออเดอร์ Shopee เป็น string ไม่ใช่ตัวเลข
- ให้ค้นทั้งค่าที่ normalize แล้ว **และ** ค่าที่ลูกค้าพิมพ์ (trim + upper) เพราะเลขบางชนิดเก็บพร้อมขีด เช่น `9015...-0009`
- ถ้ามี SQL function คู่กัน (`norm_order_key()`) ต้องอัปเดตให้ตรงกันเสมอ

### เบอร์โทร (TH)
`normalizePhoneTh()` แปลง `+66 / 66 / 0` ให้เป็น `0XXXXXXXXX` และตัดขีดกับช่องว่าง
ใน DB เบอร์ถูกเก็บหลายรูปแบบ (`0812345678`, `66812345678`, `094-6565566`) **ห้ามใช้ `.in([variants])`** เพราะจะพลาดทุกแถวที่มีขีด (วัดแล้วพลาดประมาณ 1 ใน 5)
ให้ใช้วิธีนี้แทน:
```ts
.like('phone', `%${phone.slice(-4)}`)       // ดึงกว้างด้วยเลข 4 หลักท้าย
// แล้วกรองให้แน่นใน JS
rows.filter(r => normalizePhoneTh(r.phone) === phone)
```

---

## 3. Flow A — ผูก Order (Resolve)

```
ลูกค้ากรอก ─► [channel เป็นแบบ offline? (ห้าง/ใบเสร็จ/อีเวนต์)] ─ใช่─► pending_review (ต้องแนบรูป + แอดมินอนุมัติเสมอ)
     │ไม่ใช่
     ├─ refKind = order_id ─► resolveByOrderRef(ref)
     └─ refKind = phone (FB/LINE) ─► เช็กว่าเบอร์ = เบอร์โปรไฟล์ ─ไม่ตรง─► 403 phone_mismatch
                                     └─► resolveByPhone(phone) ─► ได้หลายผลลัพธ์
```

### `resolveByOrderRef(ref)`
1. `keys = unique([normalizeOrderKey(ref), asTyped])`
2. วนค้นตามคอลัมน์ `['bill_no', 'order_no']` (**bill_no ก่อน** เพราะเป็นเลขที่ลูกค้าเห็น) และค้นทั้งสองคอลัมน์ไม่ว่าลูกค้าเลือก channel ไหน เพราะลูกค้าชอบเลือกผิดแท็บ
3. ถ้าเจอหลาย `order_no` ใต้ `bill_no` เดียวกัน ให้เรียก **`collapseSplitBill`**:
   - ออเดอร์ที่ถูก ERP แยกส่งหลายชิปเมนต์ ให้เก็บออเดอร์ลูกไว้และทิ้งออเดอร์แม่ (สถานะ `Abnormal Order` / `ออเดอร์ถูกแยกบิล`) เพราะออเดอร์แม่มีทุก SKU อยู่แล้ว ถ้านับด้วยยอดจะเบิ้ล
   - label ผลลัพธ์เป็น `"281345+281346"`
   - ถ้าวันที่ห่างกันเกิน 60 วัน ให้ถือว่าเป็น collision จริง และคืนค่า `ambiguous`
4. ถ้ายังเหลือหลาย `order_no` (เลขสั้นชนกันข้ามเดือน) ให้คืน `ambiguous` พร้อม candidates
5. ถ้าทุก line ถูก `Cancelled` ให้คืน `cancelled`
6. ถ้ายังไม่มี `transfer_date` (ETL ยัง settle ไม่เสร็จ) ให้คืน `unsettled` แล้วลองใหม่ภายหลัง
7. ไม่อย่างนั้นคืน `matched` พร้อม `netAmount = sum(amount)` ของ line ที่ไม่ cancelled และไม่ใช่ฝากขาย (ต้องใช้ predicate เดียวกับ dashboard ยอดขาย)
8. Fallback: ถ้าลูกค้ากรอก **เลข tracking พัสดุ** ให้หาใน `order_tracking.tracking_number` ถ้าได้ `online_order` ค่าเดียวให้เรียก resolve ซ้ำด้วยค่านั้น

### `resolveByPhone(phone)`
`order_tracking (phone) → online_order[] → resolveByOrderRef` ทีละตัว
**จะ auto-activate ได้เฉพาะเมื่อ `matched` มีแค่ 1 รายการ** ถ้ามากกว่านั้นให้เป็น `needs_info`

### ตัดสินผล
| ผล | link_status | ทำอะไร |
|----|-------------|--------|
| matched (1 รายการ) | `auto_matched` | เรียก `finalize_registration()` (RPC แบบ transaction: ตั้ง matched_order_no ให้ประกัน/คะแนน) **แล้วตามด้วย Flow B** |
| ambiguous / phone ที่ matched > 1 | `needs_info` | เก็บ candidates ลง `auto_match_candidates` (JSON snapshot) |
| cancelled | `not_found` | แจ้งลูกค้า |
| not_found / unsettled | `pending_review` | เข้าคิวแอดมิน **ไม่ drop ทิ้ง** |
| insert ชน unique `matched_order_no` (23505) | — | 409 `order_already_claimed` |

---

## 4. Flow B — ผูกบัญชี Platform ↔ uid สมาชิก

เรียกหลัง Flow A ได้ `matched` แล้วเท่านั้น (หรือจากหน้าแอดมิน / สคริปต์ backfill)

```ts
type BindOutcome =
  | { status: 'bound'; shop; accountNo; accountName }
  | { status: 'already_bound'; shop; accountNo }
  | { status: 'claimed_by_other'; shop; accountNo; ownerMemberId }
  | { status: 'not_found' }
  | { status: 'ambiguous'; reason }
  | { status: 'rejected'; reason }

bindPlatformAccount(db, memberId, {
  orderRefs: [input.orderRef, outcome.orderNo],   // เรียงจากเฉพาะเจาะจงที่สุด
  phone,                                          // เฉพาะ FB/LINE และต้องเป็นเบอร์ของสมาชิกเอง
  registrationId, boundVia: 'registration' | 'backfill' | 'admin',
  dryRun?: boolean,                               // เช็กทุกอย่างแต่ไม่ INSERT
})
```

### ขั้นตอน (ตามลำดับ)
1. **สมาชิกเป็น test** → `rejected: test_member`
2. **หาบัญชี**: `order_tracking.online_order IN refs` (ใช้ทั้งค่าดิบและค่าที่ normalize แล้ว) ถ้าไม่เจอและมี phone ให้ค้นด้วยเบอร์ (วิธีเลข 4 หลักท้ายในหัวข้อ 2)
   - ไม่มีแถวที่มี `buyer_account_no` → `not_found`
   - คู่ `(shop, account_no)` ที่ไม่ซ้ำกันมีมากกว่า 1 → `ambiguous`
3. **shop ต้องเป็นหน้าร้านที่ผูกได้** (`/^[A-Za-z]+_shop$/` ไม่รวม B2B/Agent) → `rejected: shop_not_bindable`
4. **รูปแบบ account_no** (ตรงกับ DB check) → `rejected: account_shape`
5. **เช็กข้อมูลขยะ** (DB check ทำไม่ได้): ดึงทุกแถวของ `account_no` นี้
   - อยู่ใต้ **มากกว่า 1 shop** → `rejected: account_spans_multiple_shops` (เช่น template `ชื่อ__0999999999` ที่แอดมินกรอกซ้ำทุกร้าน)
   - มี **`buyer_name` มากกว่า 1 ชื่อ** (ไม่นับกรณีที่ name = account_no ซึ่งเป็น fallback ของ ETL) → `ambiguous: multiple_buyer_names`
6. **เช็กเจ้าของ active**
   - เป็นของตัวเอง → `already_bound`
   - เป็นของคนอื่น → `claimed_by_other` **(ห้ามแย่ง)**
7. `dryRun` → คืน `bound` โดยไม่เขียน
8. **INSERT** ถ้าเจอ `23505` (race บน unique index) ให้**อ่านซ้ำ**ว่าใครชนะ แล้วคืน `already_bound` หรือ `claimed_by_other` ตามจริง

### Caller
```ts
try {
  const bind = await bindPlatformAccount(...)
  if (bind.status === 'claimed_by_other') {
    await db.from('audit_log').insert({ action: 'platform_account_contested',
      entity: 'member_platform_accounts', entity_id: memberId,
      after: { shop: bind.shop, account_no: bind.accountNo, owner_member_id: bind.ownerMemberId } })
  }
} catch (e) { console.error(e) }   // ห้ามทำให้การลงทะเบียนล้ม
```

### ใช้ประโยชน์จากการผูก — `listBoundOrders(memberId)`
```
member_platform_accounts (active, shop, account_no)
  → order_tracking (shop, buyer_account_no) → online_order
  → sales_transaction (bill_no)  → group by bill_no → collapseSplitBill
```
คืนรายการออเดอร์ใหม่สุดก่อน พร้อม amount, products, cancelled, settled **อ่านเฉพาะบัญชีของสมาชิกคนนี้เท่านั้น** เอาไว้แสดง "ออเดอร์ของฉัน" หรือให้แอดมินกดลงทะเบียนแทนลูกค้า (ต้องเลือกจากรายการนี้เท่านั้น)

### แอดมิน
- **Connect**: ขั้นที่ 1 `dryRun` เพื่อแสดงบัญชีที่เจอให้แอดมินตรวจ → ขั้นที่ 2 ยืนยันแล้ว bind จริง (`boundVia: 'admin'`) และบันทึก audit
- **Revoke**: `status='revoked', revoked_at, revoked_by, revoke_reason` (บังคับใส่เหตุผล) + audit ห้าม delete เพื่อเก็บประวัติไว้ unique index จะปล่อยบัญชีคืนเอง
- **โอนเจ้าของ**: ทำได้ทางเดียวคือ revoke ของคนเก่าก่อน แล้วค่อย connect ให้คนใหม่

---

## 5. Flow C — รวมสมาชิกเก่า (Relink / Merge)

**สถานการณ์:** สมาชิกเก่าถูก import มา (หรือเปลี่ยน LINE provider แล้ว `line_uid` เปลี่ยน) พอเปิดแอปใหม่จะได้แถว member ใหม่ที่ยังไม่มีประวัติ

### สร้างคำขอ (ไม่ merge ทันที)
Trigger ได้ 2 ทาง: ปุ่ม "ฉันเคยเป็นสมาชิก" (`relink_button`) หรือตอนส่งออเดอร์แล้วเบอร์ตรงกับสมาชิก legacy (`order_submit`)
1. claimant เป็น `is_test` → ตอบเหมือนหาไม่เจอ (`not_found`)
2. หา `members where phone = X and source = 'legacy' and status = 'active' and id <> claimant`
3. มีคำขอ pending เดิมอยู่แล้ว → `already_pending` (ถ้า insert ชน 23505 ก็ให้ถือเป็นผลเดียวกัน)
4. รวบรวม **evidence** ให้แอดมิน (ห้าม throw ถ้ารวบรวมไม่ได้ ให้ใส่ `evidence_error` แทน):
   - `claimant_uid_seen_in_order_tracking` / `claimant_uid_phone_matches_claim` **เป็นหลักฐานที่แข็งแรงที่สุด** เพราะแถว LINE OA เก็บ `uid` ไว้ใน `buyer_account_no` ถ้า uid ที่ verify แล้วของ claimant อยู่คู่กับเบอร์นี้ ก็เท่ากับ LINE รับรองให้
   - `legacy_registration_count`, `legacy_points`, `legacy_name`
   - `other_pending_claims` ถ้ามีคนอื่นเคลมบัญชีเดียวกันอยู่ แอดมินต้องเห็นข้อนี้เป็นอย่างแรก
5. INSERT แถว `relink_requests (pending)` การลงทะเบียนใหม่ของลูกค้ายังเดินต่อตามปกติ

### แอดมินอนุมัติ — `approve_relink_request(id, actor)` (SQL, transaction เดียว)
1. `for update` ตัวคำขอ ต้องเป็น `pending`
2. `merge_members(winner = claimant, loser = legacy, reason, actor)`
3. คำขอนี้เป็น `approved` + `merge_id` ส่วนคำขอ pending อื่นของ legacy คนเดียวกันเป็น `superseded`

`reject_relink_request(id, note, actor)` → `rejected` พร้อมบันทึก note

### `merge_members(winner, loser)` — security definer
- `winner <> loser`, `for update` ทั้งสองแถว, loser ต้องยังไม่ `merged`
- **winner = บัญชีใหม่เสมอ** (เพราะ uid ของบัญชีนี้คือตัวที่ใช้งานได้จริง)
- ย้าย `member_id` ในตารางที่ไม่ใช่ append-only: registrations, warranty items, **member_platform_accounts** (ถ้าชน unique ให้ revoke ของ loser)
- **ledger คะแนนเป็น append-only ห้ามแก้** ให้ลงรายการใหม่ 1 รายการที่ winner (`+loser.balance`) และรายการหักที่ loser ให้ยอดเป็น 0
- loser: `status='merged', merged_into=winner` (ไม่ลบแถว)
- บันทึกลง `member_merges` / audit_log ด้วยจำนวนแถวที่ย้าย

---

## 6. Backfill (ครั้งแรก / ย้อนหลัง)
สคริปต์วนทุก registration ที่ `status='active'` และมี `matched_order_no` แล้วเรียก `bindPlatformAccount(..., { boundVia: 'backfill', dryRun })`
- ให้รัน `--dry-run` ก่อน แล้วสรุปจำนวนตาม outcome (bound / claimed_by_other / ambiguous / rejected:reason)
- โมดูล resolve/bind **ห้าม import `server-only`** และให้รับ client เป็นพารามิเตอร์ จะได้ reuse กับสคริปต์ tsx ได้

---

## 7. Checklist ก่อนนำไปใช้กับโปรเจกต์ใหม่
- [ ] วัดข้อมูลจริงก่อนออกแบบ: `%` ของแถวที่มี `buyer_account_no`, `%` ของเบอร์ที่ถูก mask, จำนวนบัญชีขยะที่อยู่หลาย shop
- [ ] ยืนยันความหมายของ `bill_no` กับ `order_no` จากข้อมูลจริง (อย่าเชื่อ DDL เพราะ schema อาจเก่า)
- [ ] ระบุรายการ status ของออเดอร์แม่ที่ถูกแยกบิลใน ERP
- [ ] ตั้ง regex ของ `BINDABLE_SHOP` ให้ตรงกับหน้าร้านของโปรเจกต์ (ไม่รวม B2B)
- [ ] ใส่ unique partial index `(shop, account_no) where status='active'`
- [ ] ใส่ unique ที่ `matched_order_no` เพื่อกันเคลมออเดอร์ซ้ำ
- [ ] มีคอลัมน์ `is_test` และเช็กทุกจุดที่เขียนข้อมูลแบบ global
- [ ] ทุก SQL function ตั้ง `security definer set search_path = public` และ revoke execute จาก anon
- [ ] Rate limit ที่ endpoint submit / relink

## 8. Test cases สำคัญ
| กรณี | คาดหวัง |
|------|---------|
| Lazada วาง `#1103...` | match |
| Shopee เลขขึ้นต้นด้วย 0 | match (ไม่ตัด 0) |
| กรอกเลข tracking พัสดุ | resolve ผ่าน order_tracking |
| บิลแยก 2 ชิปเมนต์ | 1 ออเดอร์, label `A+B`, ยอดไม่เบิ้ล |
| เลขสั้นชนกันข้ามเดือน | ambiguous |
| FB: เบอร์ไม่ตรงกับโปรไฟล์ | 403 |
| เบอร์ในระบบเก็บแบบ `094-656-5566` | match |
| บัญชี `ชื่อ__0999999999` | rejected |
| สองคนเคลมบัญชีพร้อมกัน | คนหนึ่งได้ `bound` อีกคนได้ `claimed_by_other` + audit |
| บัญชี test ส่งออเดอร์ | ได้ประกันตามปกติ แต่ไม่ bind และไม่สร้าง relink |
| เบอร์ตรงกับสมาชิก legacy | สร้าง relink request เท่านั้น ไม่ merge |
| อนุมัติ relink | ย้ายประวัติ, คะแนนเป็นรายการใหม่, คำขออื่นเป็น superseded |
