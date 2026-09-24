import React, { useState } from 'react';
import Icon from './Icon';

// Small "↓ PNG · SVG" control for exporting a figure.
export default function Download({ label, formats = ['png'], onExport }) {
  const [state, setState] = useState('');
  const run = async (format) => {
    setState('busy');
    try {
      await onExport(format);
      setState('');
    } catch (error) {
      console.error(error);
      setState('failed');
    }
  };
  return (
    <div className="download" role="group" aria-label={label} title={label}>
      <Icon name="download" width="14" height="14" />
      {state === 'failed' ? (
        <button className="quiet-button" onClick={() => setState('')}>
          Export failed
        </button>
      ) : (
        formats.map((format) => (
          <button
            key={format}
            className="quiet-button"
            disabled={state === 'busy'}
            aria-label={`${label} as ${format.toUpperCase()}`}
            onClick={() => run(format)}
          >
            {format.toUpperCase()}
          </button>
        ))
      )}
    </div>
  );
}
