// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { createContext, useContext } from 'react'

import Navbar from './components/Navbar'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'

import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import HistoryPage from './pages/HistoryPage'
import AboutPage from './pages/AboutPage'

// Context để share toast xuống mọi trang — không cần truyền prop
export const ToastContext = createContext(null)
export const useAppToast = () => useContext(ToastContext)

function App() {
  const { toasts, toast, removeToast } = useToast()

  return (
    <ToastContext.Provider value={toast}>
      <BrowserRouter>
        <Navbar />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>

        {/* Toast container — render 1 lần duy nhất ở đây */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </BrowserRouter>
    </ToastContext.Provider>
  )
}

export default App