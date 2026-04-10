import { useEffect } from 'react';
import styles from './Credits.module.css';

interface CreditsProps {
  onClose: () => void;
}

const Credits = ({ onClose }: CreditsProps) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toUpperCase() === 'C') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-label="Credits">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>MIND CIRCUITS</div>
        <div className={styles.subtitle}>Philosophers' Agents</div>

        <div className={styles.divider}>{'─'.repeat(48)}</div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Artistic &amp; Conceptual Direction</div>
          <div className={styles.entry}>
            Monika Fleischmann &amp; Wolfgang Strauss
            <span>Artistic and conceptual direction</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Research</div>
          <div className={styles.entry}>
            Jasmina Marić PHD
            <span>Chalmers University of Technology · Research lead · Supervision</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Master's Project</div>
          <div className={styles.groupNote}>
            Interaction Design and Technologies · Chalmers University of Technology
          </div>
          <div className={styles.entry}>
            Max Hagman
            <span>UI/UX · Front-end</span>
          </div>
          <div className={styles.entry}>
            Sally Kalm
            <span>UI/UX · Front-end</span>
          </div>
          <div className={styles.entry}>
            Rasti Tengman
            <span>Backend · Front-end</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Scionova · Göteborg, Sweden</div>
          <div className={styles.entry}>
            Fredrik Johansson
            <span>Project Coordinator</span>
          </div>
          <div className={styles.entry}>
            Sahil Lakhe
            <span>UI · AI core &amp; backend integration</span>
          </div>
          <div className={styles.entry}>
            Sebastian Norlin
            <span>Software architecture · Scientific supervision</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Philosophers</div>
          <div className={styles.entry}>Vilém Flusser <span>(1920 – 1991)</span></div>
          <div className={styles.entry}>Joseph Weizenbaum <span>(1923 – 2008)</span></div>
          <div className={styles.entry}>Paul Virilio <span>(1932 – 2018)</span></div>
          <div className={styles.entry}>Peter Weibel <span>(1944 – 2023)</span></div>
        </div>

        <div className={styles.divider}>{'─'.repeat(48)}</div>

        <div className={styles.venue}>
          First public demonstration · Wisdome, Göteborg, Sweden
        </div>

        <div className={styles.close}>[ C ] or [ ESC ] to close · click outside to close</div>
      </div>
    </div>
  );
};

export default Credits;
