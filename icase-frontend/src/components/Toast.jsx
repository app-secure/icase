import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export function ToastContainer({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Entrar suavemente
    const enterTimer = setTimeout(() => setIsVisible(true), 10);
    // Auto-desaparecer
    const duration = toast.duration || (toast.type === "error" ? 6000 : 4000);
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss?.(toast.id), 250);
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast, onDismiss]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss?.(toast.id), 250);
  };

  const getStyles = () => {
    switch (toast.type) {
      case "success":
        return {
          border: "border-emerald-200",
          bg: "bg-white",
          text: "text-slate-800",
          icon: <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
        };
      case "error":
        return {
          border: "border-rose-200",
          bg: "bg-white",
          text: "text-slate-800",
          icon: <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
        };
      case "info":
      default:
        return {
          border: "border-violet-200",
          bg: "bg-white",
          text: "text-slate-800",
          icon: <Info size={18} className="text-violet-500 shrink-0 mt-0.5" />
        };
    }
  };

  const style = getStyles();

  return (
    <div
      role="status"
      className={`pointer-events-auto relative flex items-start gap-3 p-3.5 rounded-xl border shadow-lg transition-all duration-250 ease-out ${style.border} ${style.bg} ${
        isVisible ? "translate-x-0 opacity-100 scale-100" : "translate-x-8 opacity-0 scale-95"
      }`}
    >
      <div className="shrink-0">{style.icon}</div>
      <div className="flex-1 min-w-0 pr-1">
        {toast.title && <p className="text-xs font-semibold text-slate-900 mb-0.5">{toast.title}</p>}
        <p className="text-xs text-slate-700 leading-snug break-words">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={handleClose}
        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        aria-label="Cerrar notificación"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Hook de ayuda para manejar Toasts fácilmente
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newToast = typeof toast === "string" ? { id, message: toast, type: "success" } : { id, ...toast };
    setToasts((prev) => [...prev, newToast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}

