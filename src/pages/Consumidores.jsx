import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Consumidores() {
  const navigate = useNavigate();
  useEffect(() => { navigate(createPageUrl('Catalogos'), { replace: true }); }, [navigate]);
  return null;
}
