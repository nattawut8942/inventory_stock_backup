// config/navConfig.js — โครงสร้างเมนูของ Sidebar (ใช้ร่วมกับ Header สำหรับ breadcrumb)
import {
    LayoutDashboard, Package, ShoppingCart, Plus,
    ArrowDownToLine, History, Database, FileSpreadsheet, Shield,
    Printer, FileKey, Monitor, HardDrive, Camera,
    Cctv, Calendar, Network, ClipboardList, Activity, Briefcase, BookOpen,
    LayoutGrid, Users, Settings2, Volume2
} from 'lucide-react';

// badge = key ใน response ของ /nav-counts, badgeTone = สีป้าย, badgeLabel = ข้อความสั้นบนป้าย
export const NAV_GROUPS = [
    {
        id: 'overview', label: 'Overview', icon: LayoutDashboard, flat: true, items: [
            { to: '/activity', label: 'Activity', icon: Camera },
            { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/calendar', label: 'Calendar', icon: Calendar, badge: 'cal_today', badgeTone: 'violet', badgeLabel: 'วันนี้' },
        ],
    },
    {
        id: 'inventory', label: 'Inventory & Procurement', icon: Package, items: [
            { to: '/inventory', label: 'Stock Inventory', icon: Database, badge: 'stock_low', badgeTone: 'amber', badgeLabel: 'ใกล้หมด' },
            { to: '/ink-toner', label: 'Ink & Toner', icon: Printer },
            { to: '/purchase-orders', label: 'PR & Orders', icon: ShoppingCart, badge: 'po_open', badgeTone: 'sky', badgeLabel: 'เปิดอยู่' },
            { to: '/receive', label: 'Receive Items', icon: ArrowDownToLine, badge: 'po_partial', badgeTone: 'sky', badgeLabel: 'รอรับของ' },
        ],
    },
    {
        id: 'assets', label: 'Asset Management', icon: Monitor, items: [
            { to: '/pc-inventory', label: 'PC Inventory', icon: Monitor },
            { to: '/pc-control', label: 'Devices Layout', icon: LayoutGrid },
            { to: '/cctv-management', label: 'CCTV Management', icon: Cctv, badge: 'cctv_offline', badgeTone: 'orange', badgeLabel: 'Offline' },
            { to: '/ma-license', label: 'MA / License', icon: FileKey, badge: 'ma_attention', badgeTone: 'rose', badgeLabel: 'ใกล้หมด' },
            { to: '/printer-health', label: 'Printer Health', icon: Activity, badge: 'printer_toner_low', badgeTone: 'amber', badgeLabel: 'หมึกใกล้หมด' },
            { to: '/sound-layout', label: 'Sound Engineering', icon: Volume2 },
        ],
    },
    {
        id: 'network', label: 'Infrastructure & Network', icon: Network, items: [
            { to: '/ip-management', label: 'IP Management', icon: Network },
            { to: '/ad-explorer', label: 'AD Explorer', icon: Shield },
        ],
    },
    {
        id: 'admin', label: 'System Administration', icon: Settings2, items: [
            { to: '/quota-manager', label: 'Quota Manager', icon: HardDrive },
        ],
    },
    {
        id: 'ops', label: 'Operations & Requests', icon: ClipboardList, items: [
            { to: '/it-request', label: 'IT Request', icon: ClipboardList, badge: 'it_request_open', badgeTone: 'indigo', badgeLabel: 'รอดำเนินการ' },
            { to: '/borrowings', label: 'Borrowing System', icon: Briefcase, badge: 'borrowed', badgeTone: 'emerald', badgeLabel: 'กำลังยืม' },
            { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
            { to: '/history', label: 'History Log', icon: History },
        ],
    },
    {
        id: 'knowledge', label: 'Knowledge & Docs', icon: BookOpen, items: [
            { to: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
        ],
    },
    {
        id: 'staff', label: 'Staff Controls', icon: Users, items: [
            { to: '/manual-import', label: 'Manual Import', icon: Plus, gate: 'manualImport' },
            { to: '/management', label: 'Management', icon: Shield, gate: 'management' },
        ],
    },
];

// หาว่าหน้าปัจจุบันอยู่กลุ่มไหนและเมนูอะไร (match prefix ที่ยาวที่สุด)
export const findNavContext = (pathname) => {
    let best = null;
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            const match = pathname === item.to || pathname.startsWith(`${item.to}/`);
            if (match && (!best || item.to.length > best.item.to.length)) best = { group, item };
        }
    }
    return best;
};
