import React from 'react';
import { Clock } from 'lucide-react';

const ProjectLogs = ({ logs = [] }) => {
  const getStatusColor = (status) => {
    if (status >= 500) return '#ef4444';
    if (status >= 400) return '#f59e0b';
    return '#10b981';
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  if (logs.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
        No activity logs yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {logs.map((log, idx) => (
        <div key={idx} style={{ 
          padding: '10px 0', 
          borderBottom: idx === logs.length - 1 ? 'none' : '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, paddingRight: '12px' }}>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              padding: '2px 6px', 
              borderRadius: '4px',
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              minWidth: '40px',
              textAlign: 'center',
              flexShrink: 0
            }}>
              {log.method}
            </span>
            <span style={{ 
              fontSize: '0.75rem', 
              color: 'var(--color-text-main)', 
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }} title={log.path}>
              {log.path}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ 
                width: '6px', height: '6px', borderRadius: '50%', 
                background: getStatusColor(log.status)
              }}></div>
              <span style={{ fontSize: '0.75rem', color: getStatusColor(log.status), fontWeight: 600 }}>
                {log.status}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
              <Clock size={10} />
              {timeAgo(log.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProjectLogs;
