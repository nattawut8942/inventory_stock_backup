import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Edit2, Trash2, Loader2, AlertCircle, BookOpen,
  ExternalLink, FileText, X, Eye, Calendar, User, ChevronRight,
  Filter, RefreshCw, Upload, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_BASE, API_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';

// ── TYPE COLOR MAP ────────────────────────────────────────────────────────────
const TYPE_COLORS = [
  { bg: 'from-indigo-500 to-indigo-600', light: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { bg: 'from-violet-500 to-violet-600', light: 'bg-violet-50 text-violet-700 border-violet-100' },
  { bg: 'from-emerald-500 to-emerald-600', light: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { bg: 'from-amber-500 to-amber-600', light: 'bg-amber-50 text-amber-700 border-amber-100' },
  { bg: 'from-rose-500 to-rose-600', light: 'bg-rose-50 text-rose-700 border-rose-100' },
  { bg: 'from-cyan-500 to-cyan-600', light: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
  { bg: 'from-pink-500 to-pink-600', light: 'bg-pink-50 text-pink-700 border-pink-100' },
  { bg: 'from-teal-500 to-teal-600', light: 'bg-teal-50 text-teal-700 border-teal-100' },
];
const getTypeColor = (id) => TYPE_COLORS[(id - 1) % TYPE_COLORS.length] || TYPE_COLORS[0];

// ── STAT CARD ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4"
  >
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
      <Icon size={20} className="text-white" />
    </div>
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </motion.div>
);

// ── ARTICLE CARD ──────────────────────────────────────────────────────────────
const ArticleCard = ({ article, onView, onEdit, onDelete, typeColor, index }) => {
  // strip HTML tags for preview
  const plainText = (article.Content || '').replace(/<[^>]*>/g, '').slice(0, 120);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col"
    >
      {/* ── TOP ROW: ID + Badge + Status ── */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono text-slate-400 leading-none">
            KB-{String(article.ArticleID).padStart(4, '0')}
          </span>
          {article.ProblemTypeName && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border w-fit ${typeColor.light}`}>
              {article.icon && <span>{article.icon}</span>}
              {article.ProblemTypeName}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {article.PDFFileName && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">

              <FileText size={12} /> PDF
            </span>
          )}
          {article.UpdatedBy && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Edit2 size={10} /> แก้ไขแล้ว
            </span>
          )}
        </div>
      </div>

      {/* ── TITLE ── */}
      <div className="px-5 pb-2">
        <h3
          className="font-black text-slate-800 text-sm leading-snug line-clamp-2 cursor-pointer group-hover:text-indigo-600 transition-colors"
          onClick={() => onView(article.Slug)}
        >
          {article.Title}
        </h3>
      </div>

      {/* ── CONTENT PREVIEW ── */}
      <div
        className="mx-5 mb-3 bg-slate-50 border-l-4 rounded-r-xl p-3 cursor-pointer flex-1"
        style={{ borderLeftColor: typeColor.light.includes('indigo') ? '#6366F1' : typeColor.light.includes('violet') ? '#8B5CF6' : typeColor.light.includes('emerald') ? '#10B981' : typeColor.light.includes('amber') ? '#F59E0B' : typeColor.light.includes('rose') ? '#F43F5E' : typeColor.light.includes('cyan') ? '#06B6D4' : typeColor.light.includes('pink') ? '#EC4899' : '#14B8A6' }}
        onClick={() => onView(article.Slug)}
      >
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3 font-mono">
          {plainText || 'ไม่มีเนื้อหา'}
          {plainText.length >= 120 && '...'}
        </p>
      </div>

      {/* ── TAGS ── */}
      <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Eye size={9} /> {article.ViewCount} views
        </span>
      </div>

      {/* ── DIVIDER ── */}
      <div className="border-t border-slate-100 mx-0" />

      {/* ── FOOTER: meta + actions ── */}
      <div className="flex items-center justify-between px-5 py-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Calendar size={10} />
            <span>{new Date(article.CreatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <User size={10} />
            <span>{article.SubmittedBy || 'anonymous'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEdit(article)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="แก้ไข"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onDelete(article.ArticleID)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="ลบ"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => onView(article.Slug)}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm shadow-indigo-200"
          >
            อ่านรายละเอียด <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
const KnowledgeBasePage = () => {
  const { user } = useAuth();
  const [articles, setArticles] = useState([]);
  const [problemTypes, setProblemTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProblemType, setSelectedProblemType] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null, onCancel: null, confirmText: 'ตกลง', cancelText: 'ยกเลิก' });
  const closeAlert = () => setAlertModal(prev => ({ ...prev, isOpen: false }));
  const fileInputRef = useRef(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ title: '', problemTypeId: '', content: '', submittedBy: '', pdfFile: null });
  const [pdfFileName, setPdfFileName] = useState('');

  // ── FETCH ────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [articlesRes, typesRes] = await Promise.all([
        fetch(`${API_BASE}/knowledge-base`),
        fetch(`${API_BASE}/knowledge-base/types`)
      ]);
      if (!articlesRes.ok || !typesRes.ok) throw new Error('Failed to load');
      setArticles(await articlesRes.json());
      setProblemTypes(await typesRes.json());
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── MODAL HANDLERS ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ title: '', problemTypeId: '', content: '', submittedBy: user?.name || '', pdfFile: null });
    setPdfFileName('');
    setFormError('');
    setIsEditing(false);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (article) => {
    const contentForTextarea = (article.Content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
    setForm({ title: article.Title, problemTypeId: article.ProblemTypeID || '', content: contentForTextarea, submittedBy: article.SubmittedBy || '', pdfFile: null });
    setPdfFileName(article.PDFFileName || '');
    setFormError('');
    setIsEditing(true);
    setEditingId(article.ArticleID);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(''); };

  // ── SUBMIT ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('กรุณากรอก Title และ Content');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      const contentWithBreaks = form.content.replace(/\n/g, '<br>');
      fd.append('title', form.title);
      fd.append('problemTypeId', form.problemTypeId);
      fd.append('content', contentWithBreaks);
      fd.append('submittedBy', user?.name || form.submittedBy || 'anonymous');
      fd.append('submittedByCode', user?.empcode || user?.username || '');
      if (isEditing) fd.append('updatedBy', user?.name || 'anonymous');
      if (form.pdfFile) fd.append('pdf', form.pdfFile);

      const res = await fetch(
        isEditing ? `${API_BASE}/knowledge-base/${editingId}` : `${API_BASE}/knowledge-base`,
        { method: isEditing ? 'PUT' : 'POST', body: fd }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      await fetchData();
      closeModal();
      setAlertModal({ isOpen: true, type: 'success', title: isEditing ? 'แก้ไขสำเร็จ' : 'สร้างสำเร็จ', message: isEditing ? 'อัปเดตบทความเรียบร้อยแล้ว' : 'สร้างบทความใหม่เรียบร้อยแล้ว', onConfirm: closeAlert, confirmText: 'ปิด' });
    } catch (err) {
      setFormError(err.message || 'เกิดข้อผิดพลาด');
      setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: err.message || 'ไม่สามารถบันทึกได้ กรุณาลองใหม่', onConfirm: closeAlert, confirmText: 'ปิด' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── VIEW DETAIL ────────────────────────────────────────────────────────────────
  const handleViewDetail = async (slug) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/knowledge-base/article/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedArticle(data.article);
      }
    } catch { }
    finally { setDetailLoading(false); }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────────
  const handleDelete = (id) => {
    setAlertModal({
      isOpen: true,
      type: 'danger',
      title: 'ลบบทความ?',
      message: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่?',
      confirmText: 'ลบ',
      cancelText: 'ยกเลิก',
      onConfirm: async () => {
        try {
          await fetch(`${API_BASE}/knowledge-base/${id}`, { method: 'DELETE' });
          await fetchData();
          if (selectedArticle?.ArticleID === id) setSelectedArticle(null);
          setAlertModal({ isOpen: true, type: 'success', title: 'ลบสำเร็จ', message: 'ลบบทความออกจากระบบแล้ว', onConfirm: closeAlert, confirmText: 'ปิด' });
        } catch {
          setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถลบบทความได้ กรุณาลองใหม่', onConfirm: closeAlert, confirmText: 'ปิด' });
        }
      },
      onCancel: closeAlert,
    });
  };


  const handleDeletePdf = (articleId) => {
    setAlertModal({
      isOpen: true,
      type: 'danger',
      title: 'ลบไฟล์ PDF?',
      message: 'ไฟล์ PDF จะถูกลบออกถาวร ไม่สามารถกู้คืนได้',
      confirmText: 'ลบ PDF',
      cancelText: 'ยกเลิก',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/knowledge-base/${articleId}/pdf`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed');
          await fetchData();
          // Update selectedArticle ถ้ากำลัง view อยู่
          if (selectedArticle?.ArticleID === articleId) {
            setSelectedArticle(prev => ({ ...prev, PDFFileName: null, PDFUrl: null }));
          }
          setAlertModal({ isOpen: true, type: 'success', title: 'ลบ PDF สำเร็จ', message: 'ลบไฟล์ PDF ออกจากระบบแล้ว', onConfirm: closeAlert, confirmText: 'ปิด' });
        } catch {
          setAlertModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถลบ PDF ได้', onConfirm: closeAlert, confirmText: 'ปิด' });
        }
      },
      onCancel: closeAlert,
    });
  };

  // ── FILTER ────────────────────────────────────────────────────────────────────
  // Reset to page 1 when filter/search changes
  useEffect(() => { setCurrentPage(1); }, [search, selectedProblemType]);

  const filtered = articles.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !search || a.Title.toLowerCase().includes(q) || (a.Content || '').toLowerCase().includes(q);
    const matchType = !selectedProblemType || a.ProblemTypeID === selectedProblemType;
    return matchSearch && matchType;
  });

  const totalViews = articles.reduce((s, a) => s + (a.ViewCount || 0), 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── LOADING ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={36} className="animate-spin text-indigo-600" />
        <p className="text-slate-400 text-sm font-medium">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── HERO HEADER ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 shadow-xl"
      >
        {/* BG decoration */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -mr-24 -mt-24" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/20 rounded-full -ml-16 -mb-16" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">KNOWLEDGE BASE</h1>
              <p className="text-indigo-200 text-xs font-medium">คลังความรู้ IT Support</p>
            </div>
          </div>

          {/* Search */}
          <div className="mt-5 flex gap-3">
            <div className="flex-1 flex items-center gap-3 bg-white/15 backdrop-blur border border-white/20 rounded-xl px-4 py-3">
              <Search size={16} className="text-white/60 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาบทความ..."
                className="bg-transparent border-none outline-none text-white placeholder-white/50 text-sm w-full"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-white/60 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-white text-indigo-700 font-bold px-5 py-3 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg text-sm"
            >
              <Plus size={16} /> เพิ่มบทความ
            </button>
            <button
              onClick={fetchData}
              className="w-12 h-12 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl flex items-center justify-center text-white transition-colors"
              title="รีเฟรช"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── STAT CARDS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={BookOpen} label="บทความทั้งหมด" value={articles.length} color="from-indigo-500 to-indigo-600" />
        <StatCard icon={Eye} label="ยอดวิวรวม" value={totalViews.toLocaleString()} color="from-violet-500 to-violet-600" />
        <StatCard icon={Filter} label="ประเภทปัญหา" value={problemTypes.length} color="from-emerald-500 to-emerald-600" />
      </div>

      {/* ── ERROR ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={18} />
          {error}
          <button onClick={fetchData} className="ml-auto text-red-500 hover:text-red-700 font-bold">ลองอีกครั้ง</button>
        </div>
      )}

      {/* ── FILTER PILLS ─────────────────────────────────────────────────────── */}
      {problemTypes.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedProblemType(null)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              selectedProblemType === null
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            ทั้งหมด ({articles.length})
          </button>
          {problemTypes.map(t => {
            const color = getTypeColor(t.id);
            const count = articles.filter(a => a.ProblemTypeID === t.id).length;
            const active = selectedProblemType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedProblemType(active ? null : t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  active
                    ? `bg-gradient-to-r ${color.bg} text-white border-transparent shadow-md`
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {t.icon && <span>{t.icon}</span>}
                {t.name}
                <span className={`ml-0.5 ${active ? 'opacity-80' : 'text-slate-400'}`}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── ARTICLE GRID ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-slate-400"
        >
          <BookOpen size={48} className="mb-4 opacity-30" />
          <p className="font-bold text-slate-500 mb-1">ไม่พบบทความ</p>
          <p className="text-sm">
            {search ? `ไม่พบผลลัพธ์สำหรับ "${search}"` : 'กด "เพิ่มบทความ" เพื่อเริ่มต้น'}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginated.map((article, i) => (
                  <ArticleCard
                key={article.ArticleID}
                article={article}
                index={i}
                onView={handleViewDetail}
                onEdit={openEdit}
                onDelete={handleDelete}
                typeColor={getTypeColor(article.ProblemTypeID || 1)}
              />
          ))}
        </div>
      )}


      {/* ── PAGINATION ───────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-slate-400">
            แสดง {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} จาก {filtered.length} บทความ
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >«</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >‹ ก่อนหน้า</button>

            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`dot-${idx}`} className="px-2 text-slate-300 text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                      currentPage === p
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >{p}</button>
                )
              )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >ถัดไป ›</button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >»</button>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(selectedArticle || detailLoading) && (
          <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedArticle(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {detailLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 size={28} className="animate-spin text-indigo-600" />
                </div>
              ) : selectedArticle && (
                <>
                  {/* Header */}
                  <div className={`bg-gradient-to-r ${getTypeColor(selectedArticle.ProblemTypeID || 1).bg} p-6 relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10" />
                    <div className="flex justify-between items-start relative z-10">
                      <div>
                        {selectedArticle.ProblemTypeName && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full mb-2">
                            {selectedArticle.icon && <span>{selectedArticle.icon}</span>}
                            {selectedArticle.ProblemTypeName}
                          </span>
                        )}
                        <h2 className="text-xl font-black text-white leading-snug">{selectedArticle.Title}</h2>
                        <div className="flex items-center gap-3 mt-2 text-white/70 text-xs">
                          <span className="flex items-center gap-1"><Eye size={11} /> {selectedArticle.ViewCount} views</span>
                          <span className="flex items-center gap-1"><User size={11} /> {selectedArticle.SubmittedBy}</span>
                          <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(selectedArticle.CreatedAt).toLocaleDateString('th-TH')}</span>
                        </div>
                      </div>
                      <button onClick={() => setSelectedArticle(null)} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors text-white">
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div
                      className="prose prose-sm max-w-none text-slate-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedArticle.Content }}
                    />

                    {/* PDF */}
                    {selectedArticle.PDFFileName && (
                      <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <FileText size={18} className="text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-bold text-emerald-800 text-sm">{selectedArticle.PDFFileName}</p>
                            <p className="text-emerald-600 text-xs">PDF document</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`${API_URL}/kb-pdfs/${selectedArticle.PDFFileName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                          >
                            <ExternalLink size={14} /> เปิด PDF
                          </a>
                          <button
                            onClick={() => handleDeletePdf(selectedArticle.ArticleID)}
                            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-500 font-bold px-4 py-2 rounded-lg text-sm transition-colors border border-red-200"
                          >
                            <Trash2 size={14} /> ลบ PDF
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-slate-100 flex gap-3">
                    <button
                      onClick={() => { openEdit(selectedArticle); setSelectedArticle(null); }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-colors"
                    >
                      <Edit2 size={14} /> แก้ไข
                    </button>
                    <button
                      onClick={() => handleDelete(selectedArticle.ArticleID)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={14} /> ลบ
                    </button>
                    <button
                      onClick={() => setSelectedArticle(null)}
                      className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                    >
                      ปิด
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      {/* ── ADD / EDIT MODAL ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                    {isEditing ? <Edit2 size={16} className="text-white" /> : <Plus size={16} className="text-white" />}
                  </div>
                  <h2 className="font-black text-slate-800 text-base">
                    {isEditing ? 'แก้ไขบทความ' : 'เพิ่มบทความใหม่'}
                  </h2>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-5">

                  {formError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                      <AlertCircle size={16} /> {formError}
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      หัวข้อบทความ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder="เช่น วิธีแก้ปัญหา WiFi ไม่ได้"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>

                  {/* Problem Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      ประเภทปัญหา
                    </label>
                    <select
                      value={form.problemTypeId}
                      onChange={e => setForm({ ...form, problemTypeId: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white"
                    >
                      <option value="">-- เลือกประเภท --</option>
                      {problemTypes.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.icon ? `${t.icon} ${t.name}` : t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Content */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      เนื้อหา <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.content}
                      onChange={e => setForm({ ...form, content: e.target.value })}
                      rows={8}
                      placeholder="อธิบายวิธีแก้ปัญหาหรือขั้นตอนการทำงาน..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
                    />
                  </div>

                  {/* Submitted By */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      ชื่อผู้บันทึก
                    </label>
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                        {user?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{user?.name || '-'}</p>
                        <p className="text-xs text-slate-400">{user?.empcode || user?.username || ''}</p>
                      </div>
                    </div>
                  </div>

                  {/* PDF Upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      แนบไฟล์ PDF
                    </label>
                    {/* Show existing PDF with delete option */}
                    {pdfFileName && !form.pdfFile && (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-2">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-emerald-600" />
                          <span className="text-emerald-700 font-bold text-sm truncate max-w-[200px]">{pdfFileName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingId) handleDeletePdf(editingId);
                            setPdfFileName('');
                          }}
                          className="flex items-center gap-1 text-red-500 hover:text-red-700 text-xs font-bold"
                        >
                          <Trash2 size={12} /> ลบ
                        </button>
                      </div>
                    )}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                        form.pdfFile
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.type !== 'application/pdf') {
                              setFormError('กรุณาเลือกไฟล์ PDF เท่านั้น');
                              return;
                            }
                            setForm(f => ({ ...f, pdfFile: file }));
                            setPdfFileName(file.name);
                          }
                        }}
                      />
                      {pdfFileName ? (
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle size={18} className="text-emerald-500" />
                          <span className="text-emerald-700 font-bold text-sm">{pdfFileName}</span>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, pdfFile: null })); setPdfFileName(''); }}
                            className="ml-2 text-slate-400 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <Upload size={24} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-slate-400 text-sm">คลิกเพื่อเลือกไฟล์ PDF</p>
                          <p className="text-slate-300 text-xs mt-1">รองรับภาษาไทย, ขนาดสูงสุด 50MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
                  >
                    {submitting ? (
                      <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>
                    ) : (
                      <><CheckCircle size={16} /> {isEditing ? 'บันทึกการแก้ไข' : 'สร้างบทความ'}</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      {/* ── ALERT MODAL ─────────────────────────────────────────────────────── */}
      <AlertModal
        isOpen={alertModal.isOpen}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        onConfirm={alertModal.onConfirm || closeAlert}
        onCancel={alertModal.onCancel}
        confirmText={alertModal.confirmText || 'ตกลง'}
        cancelText={alertModal.cancelText || 'ยกเลิก'}
      />

    </div>
  );
};

export default KnowledgeBasePage;