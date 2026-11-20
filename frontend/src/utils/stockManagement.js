// ประเภทการจัดการสต็อก — กฎเดียวกับ backend/src/lib/stockManagement.js (ถ้าแก้ ต้องแก้ทั้งสองที่)
//   Rotating = สต็อกหมุนเวียน : เตือน + สั่งซื้อ + คาดการณ์ (พฤติกรรมเดิม)
//   Spare    = อุปกรณ์สำรอง   : เตือนเมื่อต่ำกว่า Min + อยู่ในรายการสั่ง (เติมของสำรอง) แต่ไม่คาดการณ์
//   Stored   = ของเก็บในคลัง  : แสดงยอดอย่างเดียว ไม่เตือน ไม่สั่ง

export const MANAGEMENT_TYPES = [
  { id: 'Rotating', label: 'สต็อกหมุนเวียน', short: 'หมุนเวียน', hint: 'ใช้ประจำ ต้องสั่งเพิ่มเรื่อยๆ — เตือน คาดการณ์ และแนะนำการสั่ง', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'Spare', label: 'อุปกรณ์สำรอง', short: 'สำรอง', hint: 'สำรองไว้เผื่อเสีย — เตือนเมื่อต่ำกว่าขั้นต่ำ แต่ไม่คาดการณ์การใช้', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'Stored', label: 'ของเก็บในคลัง', short: 'เก็บในคลัง', hint: 'ไม่มีแผนสั่ง — แสดงยอดอย่างเดียว ไม่เตือน ไม่อยู่ในรายการสั่ง', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
];
export const DEFAULT_MANAGEMENT_TYPE = 'Rotating';

const byId = Object.fromEntries(MANAGEMENT_TYPES.map((t) => [t.id, t]));
export const managementTypeOf = (p) => (byId[p?.ManagementType] ? p.ManagementType : DEFAULT_MANAGEMENT_TYPE);
export const managementTypeInfo = (idOrProduct) =>
  byId[typeof idOrProduct === 'string' ? idOrProduct : managementTypeOf(idOrProduct)] || byId[DEFAULT_MANAGEMENT_TYPE];

export const isStored = (p) => managementTypeOf(p) === 'Stored';
export const isSpare = (p) => managementTypeOf(p) === 'Spare';

// ของใกล้หมด: คงเหลือ ≤ ขั้นต่ำ และตั้งขั้นต่ำไว้ (> 0) และไม่ใช่ของเก็บในคลัง
export const isLowStock = (p) => {
  const min = Number(p?.MinStock) || 0;
  return min > 0 && (Number(p?.CurrentStock) || 0) <= min && !isStored(p);
};
