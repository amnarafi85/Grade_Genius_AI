import { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import "./auth.css"

export default function Auth() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(false)

  // Extra fields for signup
  const [teacherName, setTeacherName] = useState("")
  const [courseNamesCsv, setCourseNamesCsv] = useState("") // e.g. "Algebra I, Geometry"
  // Per-course sections input (csv per course)
  const [courseSections, setCourseSections] = useState<Record<string, string>>({})

  // Forgot/reset password
  const [isResetRequestMode, setIsResetRequestMode] = useState(false) // clicking "Forgot?"
  const [isRecoveryMode, setIsRecoveryMode] = useState(false) // landed via email link
  const [newPassword, setNewPassword] = useState("")

  // Internal guard so we auto-apply password only once after recovery
  const [autoResetAttempted, setAutoResetAttempted] = useState(false)

  // --- Helpers: parse tokens from URL fragment (access_token & refresh_token) ---
  function parseHashTokens(hash: string) {
    // hash looks like: #access_token=...&refresh_token=...&type=recovery
    const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash
    const params = new URLSearchParams(withoutHash)
    const access_token = params.get("access_token") || undefined
    const refresh_token = params.get("refresh_token") || undefined
    const type = params.get("type") || undefined
    return { access_token, refresh_token, type }
  }

  // 1) On mount, restore session from URL (supports both ?code= and #access_token=)
  useEffect(() => {
    const hash = window.location.hash || ""
    const search = window.location.search || ""
    const urlParams = new URLSearchParams(search)

    const { access_token, refresh_token, type: hashType } = parseHashTokens(hash)
    const hasTokens = !!access_token && !!refresh_token
    const code = urlParams.get("code") || undefined
    const isRecoveryFlag = /type=recovery/.test(hash) || /type=recovery/.test(search) || hashType === "recovery"

    ;(async () => {
      try {
        if (hasTokens) {
          const { error } = await supabase.auth.setSession({
            access_token: access_token!,
            refresh_token: refresh_token!,
          })
          if (error) console.error("setSession error:", error.message)
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) console.error("exchangeCodeForSession error:", error.message)
        }

        if (isRecoveryFlag || code) {
          setIsRecoveryMode(true)
          setIsSignup(false)
          setIsResetRequestMode(false)
        }

        // Edge case: if session already exists on load and we have a pending password, apply it
        const { data: sess } = await supabase.auth.getSession()
        if (sess?.session) {
          const pending = localStorage.getItem("pendingNewPassword")
          if (pending) {
            const { error } = await supabase.auth.updateUser({ password: pending })
            if (!error) {
              localStorage.removeItem("pendingNewPassword")
              alert("Password updated successfully. You can now log in.")
              setIsRecoveryMode(false)
              setNewPassword("")
              // Clean URL (remove code/hash)
              window.history.replaceState({}, "", window.location.pathname)
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  // 2) Also listen for auth events; when SIGNED_IN happens (after clicking email), set password from cache
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const pending = localStorage.getItem("pendingNewPassword")
        if (pending && !autoResetAttempted) {
          setAutoResetAttempted(true)
          const { error } = await supabase.auth.updateUser({ password: pending })
          if (error) {
            alert(error.message || "Failed to update password.")
          } else {
            localStorage.removeItem("pendingNewPassword")
            alert("Password updated successfully. You can now log in.")
            setIsRecoveryMode(false)
            setNewPassword("")
            window.history.replaceState({}, "", window.location.pathname)
          }
        }
      }

      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true)
        setIsSignup(false)
        setIsResetRequestMode(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [autoResetAttempted])

  // (Your original auto-apply effect kept as a fallback—now it also checks for session)
  useEffect(() => {
    if (!isRecoveryMode || autoResetAttempted) return
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess?.session) return // don't attempt without a session
      const pending = localStorage.getItem("pendingNewPassword")
      if (!pending) return

      setAutoResetAttempted(true)
      try {
        const { error } = await supabase.auth.updateUser({ password: pending })
        if (error) throw error
        localStorage.removeItem("pendingNewPassword")
        alert("Password updated successfully. You can now log in.")
        setIsRecoveryMode(false)
        setNewPassword("")
        window.history.replaceState({}, "", window.location.pathname)
      } catch (err: any) {
        alert(err.message || "Failed to update password. Please try again.")
      }
    })()
  }, [isRecoveryMode, autoResetAttempted])

  // Parse course list from CSV
  const courseList = useMemo(() => {
    const parts = courseNamesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    return Array.from(new Set(parts)) // dedupe
  }, [courseNamesCsv])

  // Ensure courseSections has keys for each course
  useEffect(() => {
    setCourseSections((prev) => {
      const next: Record<string, string> = { ...prev }
      courseList.forEach((c) => {
        if (!(c in next)) next[c] = ""
      })
      // Drop removed courses
      Object.keys(next).forEach((k) => {
        if (!courseList.includes(k)) delete next[k]
      })
      return next
    })
  }, [courseList])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      if (isRecoveryMode) {
        // Manual fallback if needed, but normally handled automatically on SIGNED_IN
        const { data: sess } = await supabase.auth.getSession()
        if (!sess?.session) throw new Error("Auth session missing! Please click the email link again.")
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
        alert("Password updated successfully. You can now log in.")
        setIsRecoveryMode(false)
        setNewPassword("")
        return
      }

      if (isResetRequestMode) {
        // Collect desired new password now; store temporarily
        if (!newPassword || newPassword.length < 6) {
          throw new Error("Please enter a new password (min 6 characters).")
        }
        localStorage.setItem("pendingNewPassword", newPassword)

        // IMPORTANT: redirectTo should be a whitelisted URL in Supabase Auth -> URL Configuration
        const redirectTo = `${window.location.origin}${window.location.pathname}` // Supabase will add ?code=&type=recovery
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        alert("Password reset link sent! Check your email to confirm.")
        setIsResetRequestMode(false)
        return
      }

      if (isSignup) {
        // Sign up with metadata for convenience; Supabase will store it in user metadata
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: teacherName,
            },
            emailRedirectTo: window.location.origin + window.location.pathname,
          },
        })
        if (error) throw error

        // If immediate session is available (depends on your email confirmation settings),
        // create domain rows now. If not, user will confirm by email and can be created later on first login.
        const user = data.user ?? (await supabase.auth.getUser()).data.user
        if (user) {
          // Insert teacher row (id = auth user id), plus email & name
          const teacherPayload = {
            id: user.id, // Important to keep consistent with auth.uid()-based designs
            email: user.email,
            name: teacherName || null,
          }

          const { error: teacherErr } = await supabase
            .from("teachers")
            .insert(teacherPayload)
            .single()

          if (teacherErr && teacherErr.code !== "23505") {
            // ignore unique-violation if it already exists; otherwise throw
            throw teacherErr
          }

          // Insert courses and sections
          const courseInserts = courseList.map((name) => ({
            teacher_id: user.id,
            name,
          }))

          let createdCourses: { id: string; name: string }[] = []
          if (courseInserts.length > 0) {
            const { data: insCourses, error: cErr } = await supabase
              .from("courses")
              .insert(courseInserts)
              .select("id, name")

            if (cErr) throw cErr
            createdCourses = insCourses || []
          }

          // Build sections from per-course CSVs
          const sectionInserts: { course_id: string; name: string }[] = []
          for (const c of createdCourses) {
            const secsCsv = (courseSections[c.name] || "").trim()
            if (!secsCsv) continue
            const sections = Array.from(
              new Set(
                secsCsv
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            )
            sections.forEach((s) => {
              sectionInserts.push({ course_id: c.id, name: s })
            })
          }

          if (sectionInserts.length > 0) {
            const { error: sErr } = await supabase.from("sections").insert(sectionInserts)
            if (sErr) throw sErr
          }
        }

        alert("Signup successful! Check your email to confirm.")
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <h1>
        {isRecoveryMode
          ? "Set New Password"
          : isResetRequestMode
          ? "Reset Password"
          : isSignup
          ? "Sign Up"
          : "Login"}
      </h1>

      <form onSubmit={handleSubmit}>
        {/* Email is needed for all modes except post-login operations */}
        {!isRecoveryMode && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        {/* Password input:
            - Login or Sign-up uses password
            - For 'Reset Password' request, we also ask the NEW password now
            - Recovery mode can still show a new password input (fallback) */}
        {!isRecoveryMode && !isResetRequestMode && (
          <input
            type="password"
            placeholder={isSignup ? "Password (min 6 chars)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}

        {/* NEW: In Reset Request mode, ask for the new password up front */}
        {isResetRequestMode && (
          <input
            type="password"
            placeholder="New Password (min 6 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        )}

        {/* Recovery mode new password field (manual fallback; auto flow uses SIGNED_IN) */}
        {isRecoveryMode && (
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        )}

        {/* Extra fields only on Sign Up */}
        {isSignup && !isRecoveryMode && (
          <>
            <input
              type="text"
              placeholder="Teacher Name"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              required
            />

            <textarea
              placeholder="Courses (comma-separated, e.g. Algebra I, Geometry)"
              value={courseNamesCsv}
              onChange={(e) => setCourseNamesCsv(e.target.value)}
              rows={3}
            />

            {/* Per-course sections fields */}
            {courseList.length > 0 && (
              <div style={{ width: "100%" }}>
                <div style={{ fontWeight: 600, margin: "8px 0" }}>
                  Sections for each course (comma-separated)
                </div>
                {courseList.map((c) => (
                  <div key={c} style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", marginBottom: 4 }}>{c} — Sections</label>
                    <input
                      type="text"
                      placeholder="e.g. Section A, Section B"
                      value={courseSections[c] || ""}
                      onChange={(e) =>
                        setCourseSections((prev) => ({ ...prev, [c]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button type="submit" disabled={loading}>
          {loading
            ? "Loading..."
            : isRecoveryMode
            ? "Update Password"
            : isResetRequestMode
            ? "Send Reset Link"
            : isSignup
            ? "Sign Up"
            : "Login"}
        </button>
      </form>

      {/* Toggle links */}
      {!isRecoveryMode && (
        <>
          {!isSignup && !isResetRequestMode && (
            <p
              className="toggle-text"
              onClick={() => {
                setIsResetRequestMode(true)
                setNewPassword("")
              }}
              style={{ marginTop: 8 }}
            >
              Forgot your password?
            </p>
          )}

          {isResetRequestMode && (
            <p
              className="toggle-text"
              onClick={() => setIsResetRequestMode(false)}
              style={{ marginTop: 8 }}
            >
              Back to Login
            </p>
          )}

          <p
            className="toggle-text"
            onClick={() => {
              setIsSignup(!isSignup)
              setIsResetRequestMode(false)
            }}
          >
            {isSignup ? "Already have an account? Login" : "Don't have an account? Sign Up"}
          </p>
        </>
      )}
    </div>
  )
}
