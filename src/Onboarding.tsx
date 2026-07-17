import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import logoUrl from './assets/logo.svg'
import { Settings } from './components/Settings'

const slides = [
  {
    id: 'slide-1',
    title: 'Welcome to Edge-Drop',
    description: 'Edge-Drop lives hidden on the left edge of your screen. Simply move your mouse to the left edge to open the panel, and move away to hide it.',
    videoSrc: 'welcome.webm',
    placeholderColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)'
  },
  {
    id: 'slide-2',
    title: 'Collect Anything',
    description: 'Whenever you press Ctrl+C to copy text, images, or files, Edge-Drop automatically catches and saves them in the background.',
    videoSrc: 'copy.webm',
    placeholderColor: 'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)'
  },
  {
    id: 'slide-3',
    title: 'Drag & Drop Anywhere',
    description: 'Need to use an item? Just open the panel and drag the card directly into any application, folder, or document.',
    videoSrc: 'drag.webm',
    placeholderColor: 'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)'
  },
  {
    id: 'slide-4',
    title: 'Explore File Stacks',
    description: 'Copying multiple files groups them into a stack. You can drag the entire stack, or click it to view and extract individual files.',
    videoSrc: 'stack.webm',
    placeholderColor: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)'
  },
  {
    id: 'slide-5-ungroup',
    title: 'Ungroup & Split Stacks',
    description: 'Want to separate items in a stack? Click to expand the stack, then drag any subitem to the left edge of the screen. A glowing coral bar will appear—drop the item on it to extract it back into a standalone card.',
    videoSrc: 'ungroup.webm',
    placeholderColor: 'linear-gradient(135deg, #FAD961 0%, #F76B1C 100%)'
  },
  {
    id: 'slide-5',
    title: 'Combine & Merge Items',
    description: 'Combine separate file or image cards by dragging them directly onto each other. This organizes your shelf by bundling related assets into a stack.',
    videoSrc: 'merge.webm',
    placeholderColor: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)'
  },
  {
    id: 'slide-6',
    title: 'Configure Your Clipboard',
    description: 'Customize how Edge-Drop works for you.',
    videoSrc: '',
    placeholderColor: 'transparent'
  }
]

export function Onboarding() {
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      finish()
    }
  }

  const handleSkip = () => {
    setCurrentIndex(slides.length - 1)
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const finish = async () => {
    await window.edge.updateSettings({ tutorialCompleted: true })
    window.close()
  }

  const currentSlide = slides[currentIndex]

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#121212',
      color: '#fff',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Titlebar & Header */}
      <div style={{
        height: '60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        boxSizing: 'border-box',
        ...({ WebkitAppRegion: 'drag' } as any)
      }}>
        {/* Logo Area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
          <img src={logoUrl} alt="Edge-Drop Logo" style={{ width: '42px', height: '42px' }} />
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          {currentIndex !== slides.length - 1 && (
            <button
              onClick={handleSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                transition: 'color 0.2s, background 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)' }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent' }}
            >
              Skip
            </button>
          )}
          <button
            onClick={() => window.edge.minimizeWindow()}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
            title="Minimize"
          >
            <svg width="14" height="2" viewBox="0 0 14 2" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {currentSlide.id === 'slide-6' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'stretch', padding: '16px 48px', gap: '40px', width: '100%', boxSizing: 'border-box', minHeight: 0 }}>
          {/* Left Side: Textual Description */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: '28px', margin: '0 0 16px 0', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {currentSlide.title}
            </h1>
            <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px 0' }}>
              {currentSlide.description}
            </p>
            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Quick Tips:</div>
              <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                <li>Press <strong>Alt + C</strong> to instantly toggle the shelf.</li>
                <li>Access settings anytime via the gear icon (top right).</li>
                <li>Drag & drop files to the left edge to add them.</li>
                <li>Click a text box, then a clipboard item to auto-paste.</li>
                <li>Stack files with files (e.g., zip, md, json) or images with images (max 10). Text cannot be stacked.</li>
              </ul>
            </div>
          </div>
          {/* Right Side: Settings */}
          <div style={{ flex: 1, background: '#1a1a1c', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', boxSizing: 'border-box' }}>
              <Settings />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 48px' }}>
          {/* Video / Placeholder Area */}
          <div style={{
            width: '100%',
            maxWidth: '560px',
            height: '315px', // 16:9 aspect ratio
            background: '#1a1a1c',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            marginBottom: '36px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: currentSlide.placeholderColor
                }}
              >
                <video
                  key={currentSlide.videoSrc}
                  src={`${currentSlide.videoSrc}?v=1`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={(e) => {
                    console.error("Video loading error:", currentSlide.videoSrc, e.currentTarget.error);
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Text Area */}
          <div style={{ textAlign: 'center', height: '100px', maxWidth: '480px' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <h1 style={{ fontSize: '24px', margin: '0 0 12px 0', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {currentSlide.title}
                </h1>
                <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                  {currentSlide.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div style={{
        height: '80px',
        padding: '0 40px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        borderTop: '1px solid #333'
      }}>
        {/* Left Area (Previous) */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            style={{
              background: '#2a2a2a',
              border: '1px solid #444',
              color: currentIndex === 0 ? '#555' : '#fff',
              fontSize: '15px',
              fontWeight: 500,
              cursor: currentIndex === 0 ? 'default' : 'pointer',
              padding: '8px 20px',
              borderRadius: '6px',
              transition: 'background 0.2s',
              opacity: currentIndex === 0 ? 0 : 1, // Hide when disabled for perfect symmetry
              pointerEvents: currentIndex === 0 ? 'none' : 'auto'
            }}
            onMouseOver={(e) => { if (currentIndex !== 0) e.currentTarget.style.background = '#333' }}
            onMouseOut={(e) => { if (currentIndex !== 0) e.currentTarget.style.background = '#2a2a2a' }}
          >
            Previous
          </button>
        </div>

        {/* Center Area (Dots) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: i === currentIndex ? '#fff' : '#444',
                transition: 'background 0.3s'
              }}
            />
          ))}
        </div>

        {/* Right Area (Next) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleNext}
            style={{
              background: '#fff',
              border: 'none',
              color: '#000',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 24px',
              borderRadius: '6px',
              transition: 'transform 0.1s, opacity 0.2s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            {currentIndex === slides.length - 1 ? "Save & Let's Go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
