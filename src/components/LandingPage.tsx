import React from "react";
import "./LandingPage.css";

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="landing-container">
      {/* 🌌 Animated glowing background with circuit patterns */}
      <div className="background-effects">
        <div className="purple-glow"></div>
        <div className="blue-glow"></div>
        <div className="radial-gradient"></div>
        <div className="circuit-pattern"></div>
        <div className="stars"></div>
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <svg className="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            {/* Robot head with graduation cap */}
            <defs>
              <linearGradient id="robotGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#06b6d4', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            {/* Robot face */}
            <rect x="25" y="45" width="50" height="40" rx="8" fill="url(#robotGradient)" stroke="currentColor" strokeWidth="2"/>
            {/* Eyes */}
            <circle cx="40" cy="60" r="5" fill="currentColor"/>
            <circle cx="60" cy="60" r="5" fill="currentColor"/>
            {/* Mouth */}
            <line x1="40" y1="75" x2="60" y2="75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            {/* Graduation cap */}
            <polygon points="50,25 70,35 50,40 30,35" fill="url(#robotGradient)" stroke="currentColor" strokeWidth="2"/>
            <rect x="48" y="35" width="4" height="10" fill="currentColor"/>
            {/* Cap tassel */}
            <line x1="70" y1="35" x2="75" y2="40" stroke="currentColor" strokeWidth="2"/>
            <circle cx="75" cy="40" r="3" fill="currentColor"/>
          </svg>
          <span>AI Grader</span>
        </div>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#about">About</a>
        </nav>
        <button onClick={onGetStarted} className="get-started-btn">
          Get Started
        </button>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-icon-wrapper">
          <svg className="hero-icon" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="heroGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#06b6d4', stopOpacity: 1 }} />
                <stop offset="50%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#a78bfa', stopOpacity: 1 }} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {/* Robot body with glow */}
            <g filter="url(#glow)">
              {/* Head */}
              <rect x="60" y="80" width="80" height="60" rx="15" fill="none" stroke="url(#heroGradient)" strokeWidth="3"/>
              {/* Eyes */}
              <circle cx="85" cy="105" r="8" fill="url(#heroGradient)"/>
              <circle cx="115" cy="105" r="8" fill="url(#heroGradient)"/>
              {/* Smile */}
              <path d="M 80 125 Q 100 135 120 125" fill="none" stroke="url(#heroGradient)" strokeWidth="3" strokeLinecap="round"/>
              {/* Graduation cap */}
              <polygon points="100,50 140,65 100,75 60,65" fill="none" stroke="url(#heroGradient)" strokeWidth="3"/>
              <rect x="97" y="65" width="6" height="15" fill="url(#heroGradient)"/>
              {/* Cap detail line */}
              <line x1="60" y1="65" x2="140" y2="65" stroke="url(#heroGradient)" strokeWidth="2"/>
              {/* Tassel */}
              <line x1="140" y1="65" x2="150" y2="75" stroke="url(#heroGradient)" strokeWidth="2"/>
              <circle cx="150" cy="75" r="4" fill="url(#heroGradient)"/>
            </g>
          </svg>
        </div>

        <h1 className="hero-title">AI Grader</h1>
        <h3 className="hero-subtitle">The Virtual Teaching Assistant (Virtual TA)</h3>

        <p className="hero-text">
          Empowering teachers with AI to evaluate handwritten quizzes,
          automate grading, and manage student performance effortlessly.
          Save time, reduce workload, and bring intelligence to your classroom.
        </p>

        <button onClick={onGetStarted} className="hero-btn">
          Get Started
        </button>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <h2 className="section-title">Why AI Grader Is Unique</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <h3>🖊 Handwritten Evaluation</h3>
            <p>AI Grader evaluates handwritten answers using advanced OCR and AI models.</p>
          </div>
          <div className="feature-card">
            <h3>⚙ Custom Criteria</h3>
            <p>Teachers define leniency, question marks, and difficulty levels.</p>
          </div>
          <div className="feature-card">
            <h3>📊 Smart Reports</h3>
            <p>Generate graded PDFs, CSV marksheets, and SWA reports automatically.</p>
          </div>
        </div>
      </section>

      {/* Workflow Section - Enhanced with icons */}
      <section id="workflow" className="workflow">
        <div className="workflow-header">
          <svg className="workflow-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="workflowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#06b6d4', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            {/* Network/connection icon */}
            <circle cx="20" cy="50" r="8" fill="url(#workflowGradient)"/>
            <circle cx="50" cy="30" r="8" fill="url(#workflowGradient)"/>
            <circle cx="50" cy="70" r="8" fill="url(#workflowGradient)"/>
            <circle cx="80" cy="50" r="8" fill="url(#workflowGradient)"/>
            <line x1="27" y1="50" x2="43" y2="35" stroke="url(#workflowGradient)" strokeWidth="2"/>
            <line x1="27" y1="50" x2="43" y2="65" stroke="url(#workflowGradient)" strokeWidth="2"/>
            <line x1="57" y1="35" x2="73" y2="50" stroke="url(#workflowGradient)" strokeWidth="2"/>
            <line x1="57" y1="65" x2="73" y2="50" stroke="url(#workflowGradient)" strokeWidth="2"/>
          </svg>
          <h2 className="section-title">How AI Grader Works</h2>
        </div>
        
        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="teacherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#a78bfa', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                {/* Teacher icon */}
                <circle cx="50" cy="35" r="15" fill="none" stroke="url(#teacherGrad)" strokeWidth="3"/>
                <path d="M 30 55 Q 50 50 70 55 L 70 75 Q 50 80 30 75 Z" fill="none" stroke="url(#teacherGrad)" strokeWidth="3"/>
                {/* Graduation cap on teacher */}
                <polygon points="50,15 65,22 50,27 35,22" fill="url(#teacherGrad)"/>
              </svg>
            </div>
            <h3>Teacher Login & Course Selection</h3>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="workflow-step">
            <div className="step-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="pdfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#a78bfa', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                {/* PDF document icon */}
                <rect x="30" y="20" width="40" height="60" rx="3" fill="none" stroke="url(#pdfGrad)" strokeWidth="3"/>
                <line x1="40" y1="35" x2="60" y2="35" stroke="url(#pdfGrad)" strokeWidth="2"/>
                <line x1="40" y1="45" x2="60" y2="45" stroke="url(#pdfGrad)" strokeWidth="2"/>
                <line x1="40" y1="55" x2="55" y2="55" stroke="url(#pdfGrad)" strokeWidth="2"/>
                <text x="50" y="72" textAnchor="middle" fill="url(#pdfGrad)" fontSize="12" fontWeight="bold">PDF</text>
              </svg>
            </div>
            <h3>Upload PDF of Quizzes/Mids</h3>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="workflow-step">
            <div className="step-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="criteriaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#a78bfa', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                {/* Sliders icon */}
                <line x1="50" y1="25" x2="50" y2="75" stroke="url(#criteriaGrad)" strokeWidth="2"/>
                <circle cx="50" cy="35" r="6" fill="url(#criteriaGrad)"/>
                <line x1="35" y1="45" x2="35" y2="75" stroke="url(#criteriaGrad)" strokeWidth="2"/>
                <circle cx="35" cy="55" r="6" fill="url(#criteriaGrad)"/>
                <line x1="65" y1="25" x2="65" y2="65" stroke="url(#criteriaGrad)" strokeWidth="2"/>
                <circle cx="65" cy="45" r="6" fill="url(#criteriaGrad)"/>
              </svg>
            </div>
            <h3>Select Criteria (leniency, difficulty, marks)</h3>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="workflow-step">
            <div className="step-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#06b6d4', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                {/* AI chip/monitor icon */}
                <rect x="25" y="35" width="50" height="35" rx="3" fill="none" stroke="url(#aiGrad)" strokeWidth="3"/>
                <text x="50" y="58" textAnchor="middle" fill="url(#aiGrad)" fontSize="16" fontWeight="bold">AI</text>
                <rect x="40" y="70" width="20" height="3" fill="url(#aiGrad)"/>
                <line x1="30" y1="73" x2="70" y2="73" stroke="url(#aiGrad)" strokeWidth="3"/>
              </svg>
            </div>
            <h3>AI Evaluation and JSON Generation</h3>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="workflow-step">
            <div className="step-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="outputGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#a78bfa', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                {/* Multiple documents icon */}
                <rect x="35" y="30" width="30" height="40" rx="2" fill="none" stroke="url(#outputGrad)" strokeWidth="2"/>
                <line x1="42" y1="40" x2="58" y2="40" stroke="url(#outputGrad)" strokeWidth="2"/>
                <line x1="42" y1="48" x2="58" y2="48" stroke="url(#outputGrad)" strokeWidth="2"/>
                <line x1="42" y1="56" x2="52" y2="56" stroke="url(#outputGrad)" strokeWidth="2"/>
                <rect x="40" y="35" width="30" height="40" rx="2" fill="none" stroke="url(#outputGrad)" strokeWidth="2.5"/>
              </svg>
            </div>
            <h3>PDF + CSV + SWA Outputs</h3>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about">
        <h2 className="section-title">About AI Grader</h2>
        <p className="about-text">
          AI Grader is a Virtual Teaching Assistant that automates the process of grading handwritten
          quizzes. It leverages OCR, Gemini 2.5, and AI grading algorithms to generate accurate,
          transparent, and insightful performance reports — saving educators hours of manual work.
        </p>
      </section>

      {/* Footer */}
      <footer className="footer">
        © {new Date().getFullYear()} <span className="highlight">AI Grader</span> — Virtual TA Project
      </footer>
    </div>
  );
};

export default LandingPage;