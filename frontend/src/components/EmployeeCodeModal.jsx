import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ScanLine, X, AlertTriangle, Check, User } from 'lucide-react';
import Portal from './Portal';
import { API_BASE } from '../config/api';

/**
 * EmployeeCodeModal
 * Asks for an employee code, looks it up against dbHRM, lets the
 * user confirm the name, then calls onConfirm with the employee payload.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onConfirm: ({ EmployeeCode, EmployeeName, CostCenter }) => void
 */
const EmployeeCodeModal = ({ isOpen, onClose, onConfirm }) => {
  const [code, setCode] = useState('');
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setEmployee(null);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleLookup = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/employees/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        setEmployee(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setEmployee(null);
        setError(data.error || `ไม่พบรหัสพนักงาน: ${trimmed}`);
      }
    } catch (err) {
      setEmployee(null);
      setError('ไม่สามารถเชื่อมต่อระบบ HR ได้');
    }
    setLoading(false);
  };

  const handleConfirm = () => {
    if (!employee) return;
    onConfirm({
      EmployeeCode: employee.EmployeeCode,
      EmployeeName: employee.FormattedName,
      CostCenter: employee.CostCenter,
    });
  };

  const resetScan = () => {
    setEmployee(null);
    setCode('');
    setError('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[90] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <User size={18} /> ยืนยันรหัสพนักงาน
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
              <X size={18} />
            </button>
          </div>

          {!employee ? (
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                <ScanLine size={26} />
              </div>
              <p className="text-slate-500 mb-4 text-sm">
                สแกนบัตรหรือพิมพ์รหัสพนักงานที่มาเบิกอุปกรณ์
              </p>
              <div className="w-full relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
                  placeholder="รหัสพนักงาน..."
                  className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-4 py-3 text-center font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                />
              </div>
              {error && (
                <p className="text-red-500 font-bold mt-3 flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} /> {error}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 w-full mt-5">
                <button
                  onClick={onClose}
                  className="py-2 rounded-lg font-bold text-slate-500 border border-slate-200 hover:bg-slate-100 text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleLookup}
                  disabled={!code.trim() || loading}
                  className="py-2 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-sm disabled:opacity-50"
                >
                  {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm mb-2">
                  <Check size={16} /> พบข้อมูลพนักงาน
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ชื่อ-นามสกุล</span>
                    <span className="font-bold text-slate-700">{employee.FirstName} {employee.LastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">บันทึกเป็น</span>
                    <span className="font-bold text-indigo-600 font-mono">{employee.FormattedName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">รหัสพนักงาน</span>
                    <span className="font-mono text-slate-600">{employee.EmployeeCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cost Center</span>
                    <span className="font-mono text-slate-600">{employee.CostCenter || '-'}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={resetScan}
                  className="col-span-1 py-2 rounded-lg font-bold text-slate-500 border border-slate-200 hover:bg-slate-100 text-sm"
                >
                  สแกนใหม่
                </button>
                <button
                  onClick={handleConfirm}
                  className="col-span-2 py-2 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 text-sm"
                >
                  ยืนยันและเบิก
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Portal>
  );
};

export default EmployeeCodeModal;