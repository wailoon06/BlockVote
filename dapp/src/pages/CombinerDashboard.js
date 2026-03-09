import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CombinerDashboard() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/'); }, [navigate]);
  return null;
}
