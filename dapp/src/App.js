import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Register from './pages/Register';
import AllUsers from './pages/AllUsers';
import Verify from './pages/Verification';
import CandidateRegister from './pages/CandidateRegister';
import CandidateVerify from './pages/CandidateVerification';
import CandidateElections from './pages/CandidateElections';
import CandidateMyElections from './pages/CandidateMyElections';
import VoterElections from './pages/VoterElections';
import OrganizerRegister from './pages/OrganizerRegister';
import AdminPanel from './pages/AdminPanel';
import OrganizerDashboard from './pages/OrganizerDashboard';
import OrganizerManageElection from './pages/OrganizerManageElection';
import ElectionResults from './pages/ElectionResults';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/candidate-register" element={<CandidateRegister />} />
        <Route path="/candidate-verify" element={<CandidateVerify />} />
        <Route path="/candidate-elections" element={<CandidateElections />} />
        <Route path="/candidate-my-elections" element={<CandidateMyElections />} />
        <Route path="/voter-elections" element={<VoterElections />} />
        <Route path="/organizer-register" element={<OrganizerRegister />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/organizer-dashboard" element={<OrganizerDashboard />} />
        <Route path="/organizer-manage-election" element={<OrganizerManageElection />} />
        <Route path="/election-results" element={<ElectionResults />} />
        <Route path="/users" element={<AllUsers />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;