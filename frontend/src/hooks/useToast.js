// src/hooks/useToast.js
import { useState, useCallback } from 'react'

// Mỗi toast có: id, type ('success'|'error'|'warning'|'info'), message, duration
let _nextId = 1

export function useToast() {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((message, type = 'info', duration = 3500) => {
        const id = _nextId++
        setToasts(prev => [...prev, { id, message, type, duration }])

        // Tự xóa sau duration ms
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    // Shorthand helpers
    const toast = {
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur || 5000),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
    }

    return { toasts, toast, removeToast }
}