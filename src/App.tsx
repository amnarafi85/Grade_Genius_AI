import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import LandingPage from "./components/LandingPage"; // ✅ New import
import TakeViva from "./components/take_viva";
function App() {
  const [session, setSession] = useState<any>(null);
  const [showLanding, setShowLanding] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} />; // ✅ show LandingPage first
  }

  return (
    <div>
      {session ? (
        <>
          <div style={{ textAlign: "center", margin: "0px" }}>
            {/* <h2>Welcome {session.user.name}</h2> */}
            {/* <button onClick={handleLogout}>Logout</button> */}
          </div>
          <Dashboard teacherId={session.user.id} />
        </>
      ) : (
        <Auth />
      )}
    </div>
  );
}

export default App;
