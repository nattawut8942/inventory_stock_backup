// ============================================================
//  QuotaJobContext.jsx
//  - polling ทำงานใน Context เอง ไม่พึ่ง component
//  - Hydrate จาก DB เมื่อ F5 หรือ user อื่นเปิดหน้าใหม่
//    → ทุกคนเห็น running jobs เดียวกัน
// ============================================================
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE } from '../config/api';

const QuotaJobContext = createContext(null);

export const QuotaJobProvider = ({ children }) => {
    const [jobItems,     setJobItems]     = useState([]);
    const [activeJobs,   setActiveJobs]   = useState({});
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [toastQueue,   setToastQueue]   = useState([]);

    const pollingRefs   = useRef({});
    const jobItemsRef   = useRef([]);
    const activeJobsRef = useRef({});

    const API = `${API_BASE}/quota`;

    // sync refs
    useEffect(() => { jobItemsRef.current  = jobItems;  }, [jobItems]);
    useEffect(() => { activeJobsRef.current = activeJobs; }, [activeJobs]);

    // ── Hydrate: ดึง running jobs จาก DB เมื่อ mount ─────────
    // ทำให้ทุก user / ทุก browser เห็น progress เดียวกัน
    useEffect(() => {
        const hydrate = async () => {
            try {
                const res = await fetch(`${API}/logs?limit=100`).then(r => r.json());
                const runningLogs = (res.data || []).filter(l => l.Status === 'running');
                if (!runningLogs.length) return;

                const restored = runningLogs.map(l => ({
                    jobId:    `db_${l.ID}`,
                    logId:    l.ID,
                    username: l.Username,
                    status:   'running',
                    step:     l.Step || 'กำลังดำเนินการ...',
                }));
                const restoredActive = {};
                runningLogs.forEach(l => { restoredActive[l.Username] = `db_${l.ID}`; });

                setJobItems(restored);
                setActiveJobs(restoredActive);

                // poll step จาก DB ทุก 5 วิ สำหรับแต่ละ running log
                runningLogs.forEach(l => {
                    const jobId = `db_${l.ID}`;
                    if (pollingRefs.current[jobId]) return;
                    const iv = setInterval(async () => {
                        try {
                            const r = await fetch(`${API}/log/${l.ID}`).then(r => r.json());
                            const log = r.data;
                            if (!log) { clearInterval(iv); delete pollingRefs.current[jobId]; return; }

                            if (log.Status === 'running') {
                                setJobItems(prev => prev.map(j =>
                                    j.jobId === jobId ? { ...j, step: log.Step || j.step } : j
                                ));
                            } else {
                                clearInterval(iv);
                                delete pollingRefs.current[jobId];
                                const isDone = log.Status === 'sent';
                                setJobItems(prev => prev.map(j =>
                                    j.jobId === jobId ? {
                                        ...j,
                                        status:     isDone ? 'done' : 'error',
                                        step:       isDone ? `✅ ส่งสำเร็จ ${log.FilesFound || 0} files` : `❌ ${log.ErrorMsg || 'ล้มเหลว'}`,
                                        filesFound: log.FilesFound,
                                    } : j
                                ));
                                setActiveJobs(prev => { const n = {...prev}; delete n[l.Username]; return n; });
                            }
                        } catch {}
                    }, 5000);
                    pollingRefs.current[jobId] = iv;
                });
            } catch {}
        };
        hydrate();
    }, []); // eslint-disable-line

    // ── push toast ──────────────────────────────────────────
    const pushContextToast = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToastQueue(q => [...q, { id, message, type }]);
    }, []);

    const consumeToast = useCallback(() => {
        const t = toastQueue[0] || null;
        if (t) setToastQueue(q => q.slice(1));
        return t;
    }, [toastQueue]);

    // ── stop poll ───────────────────────────────────────────
    const stopPoll = useCallback((jobId) => {
        if (pollingRefs.current[jobId]) {
            clearInterval(pollingRefs.current[jobId]);
            delete pollingRefs.current[jobId];
        }
    }, []);

    // ── finish job ──────────────────────────────────────────
    const finishJob = useCallback((jobId, username, status, extra = {}) => {
        stopPoll(jobId);
        setJobItems(prev => prev.map(j =>
            j.jobId === jobId ? { ...j, status, ...extra } : j
        ));
        setActiveJobs(prev => { const n = { ...prev }; delete n[username]; return n; });
    }, [stopPoll]);

    // ── update job ──────────────────────────────────────────
    const updateJob = useCallback((jobId, data) => {
        setJobItems(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data } : j));
    }, []);

    // ── add job ─────────────────────────────────────────────
    const addJob = useCallback((jobId, username, step = 'กำลังดำเนินการ...') => {
        setJobItems(prev => {
            if (prev.find(j => j.jobId === jobId)) return prev;
            return [{ jobId, username, status: 'running', step }, ...prev];
        });
        setActiveJobs(prev => ({ ...prev, [username]: jobId }));
    }, []);

    // ── poll job ────────────────────────────────────────────
    const startPollJob = useCallback((jobId, username, onToast) => {
        if (pollingRefs.current[jobId]) return;

        const iv = setInterval(async () => {
            try {
                const job = await fetch(`${API}/job/${jobId}`).then(r => r.json());

                setJobItems(prev => prev.map(j =>
                    j.jobId === jobId
                        ? { ...j, step: job.step || j.step, status: job.status || j.status, filesFound: job.filesFound ?? j.filesFound }
                        : j
                ));

                if (job.status === 'done') {
                    clearInterval(iv); delete pollingRefs.current[jobId];
                    setJobItems(prev => prev.map(j =>
                        j.jobId === jobId
                            ? { ...j, status: 'done', step: `✅ ส่งสำเร็จ ${job.filesFound || 0} files`, filesFound: job.filesFound }
                            : j
                    ));
                    setActiveJobs(prev => { const n = { ...prev }; delete n[username]; return n; });
                    const msg = `✅ ส่งให้ ${username} สำเร็จ (${job.filesFound || 0} files)`;
                    onToast ? onToast(msg, 'success') : pushContextToast(msg, 'success');

                } else if (job.status === 'error' || job.status === 'cancelled') {
                    clearInterval(iv); delete pollingRefs.current[jobId];
                    const isCancelled = job.status === 'cancelled';
                    setJobItems(prev => prev.map(j =>
                        j.jobId === jobId
                            ? { ...j, status: job.status, step: isCancelled ? '🚫 ยกเลิกแล้ว' : `❌ ${job.error || job.step}` }
                            : j
                    ));
                    setActiveJobs(prev => { const n = { ...prev }; delete n[username]; return n; });
                    const msg = isCancelled ? `🚫 ยกเลิก: ${username}` : `❌ ล้มเหลว: ${username}`;
                    onToast ? onToast(msg, isCancelled ? 'warning' : 'error') : pushContextToast(msg, 'error');
                }
            } catch {}
        }, 3000);

        pollingRefs.current[jobId] = iv;
        setTimeout(() => {
            if (pollingRefs.current[jobId]) {
                clearInterval(pollingRefs.current[jobId]);
                delete pollingRefs.current[jobId];
            }
        }, 600000);
    }, [API, pushContextToast]);

    // ── cancel job ──────────────────────────────────────────
    const cancelJobById = useCallback(async (jobId, username, onToast) => {
        stopPoll(jobId);
        try { await fetch(`${API}/cancel/${jobId}`, { method: 'POST' }); } catch {}
        setJobItems(prev => prev.map(j =>
            j.jobId === jobId ? { ...j, status: 'cancelled', step: '🚫 ยกเลิกแล้ว' } : j
        ));
        setActiveJobs(prev => { const n = { ...prev }; delete n[username]; return n; });
        const msg = `🚫 ยกเลิก ${username} แล้ว`;
        onToast ? onToast(msg, 'warning') : pushContextToast(msg, 'warning');
    }, [API, stopPoll, pushContextToast]);

    // ── restore polling (ถ้ามี running jobs ที่ยังไม่ได้ poll) ─
    const restorePolling = useCallback((onToast) => {
        jobItemsRef.current.forEach(j => {
            if (j.status === 'running' && !pollingRefs.current[j.jobId] && !j.jobId.startsWith('db_')) {
                startPollJob(j.jobId, j.username, onToast);
            }
        });
    }, [startPollJob]);

    // ── clear done jobs ─────────────────────────────────────
    const clearDoneJobs = useCallback(() => {
        setJobItems(prev => prev.filter(j => j.status === 'running'));
    }, []);

    // cleanup on unmount
    useEffect(() => {
        return () => { Object.values(pollingRefs.current).forEach(clearInterval); };
    }, []);

    return (
        <QuotaJobContext.Provider value={{
            jobItems, setJobItems,
            activeJobs, setActiveJobs,
            bulkProgress, setBulkProgress,
            toastQueue, consumeToast,
            addJob, updateJob, finishJob,
            startPollJob, cancelJobById,
            clearDoneJobs, restorePolling,
        }}>
            {children}
        </QuotaJobContext.Provider>
    );
};

export const useQuotaJobs = () => {
    const ctx = useContext(QuotaJobContext);
    if (!ctx) throw new Error('useQuotaJobs must be used inside QuotaJobProvider');
    return ctx;
};