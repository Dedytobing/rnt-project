'use client';

import { useEffect, useState } from 'react';

export default function CandidateLogs({ candidateId, reviewerNames }) {
  const [lastCheck, setLastCheck] = useState({ candidateId: '', name: '' });

  useEffect(() => {
    if (!candidateId) return undefined;

    let active = true;
    fetch(`/api/candidates?candidate_id=${candidateId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const latestStaffAction = (data.logs || []).find((log) => log.role_action !== 'REGISTER');
        setLastCheck({
          candidateId,
          name: data.success ? latestStaffAction?.officer_name || '—' : '—',
        });
      })
      .catch(() => {
        if (active) setLastCheck({ candidateId, name: '—' });
      });

    return () => {
      active = false;
    };
  }, [candidateId]);

  return (
    <div className="candidate-staff-info" aria-live="polite">
      <div><span>Reviewer CV</span><strong>{reviewerNames || '—'}</strong></div>
      <div><span>Last Check by</span><strong>{lastCheck.candidateId === candidateId ? lastCheck.name : 'Memuat…'}</strong></div>
    </div>
  );
}
