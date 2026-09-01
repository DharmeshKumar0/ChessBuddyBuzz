import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GamePage, PlayFriendsPage } from './pages';
import { AnalysisPage } from './pages/AnalysisPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />} />
        {/* Play with a Friend: /friends creates a room, /join/:roomId is the
            invite link the friend receives. Same component, two entry points. */}
        <Route path="/friends" element={<PlayFriendsPage />} />
        <Route path="/join/:roomId" element={<PlayFriendsPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
