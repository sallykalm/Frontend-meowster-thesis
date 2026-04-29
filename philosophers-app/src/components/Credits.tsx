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

        <div className={styles.divider}>{'─'.repeat(48)}</div>

        <div className={styles.creditsList}>
          <div className={styles.entry}>
            <div className={styles.name}>Monika Fleischmann &amp; Wolfgang Strauss</div>
            <span>Artistic Direction &amp; Concept</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Jasmina Marić, PhD</div>
            <span>Project lead &amp; Supervision, Chalmers University</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Max Hagman &amp; Sally Kalm</div>
            <span>UI/UX, Visual Design &amp; Front-End Development,<br />Chalmers Master's thesis students</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Rasti Tengman</div>
            <span>Back/Front-End Development,<br />Chalmers Master's thesis student</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Sebastian Norlin</div>
            <span>Back-End Development &amp; Supervision, Scionova</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Fredrik Johansson</div>
            <span>Value Coordinator, Scionova</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Sahil Lakhe</div>
            <span>Back-End Development, Scionova</span>
          </div>

          <div className={styles.entry}>
            <div className={styles.name}>Jakob Dahl</div>
            <span>Music</span>
          </div>
        </div>

        <div className={styles.divider}>{'─'.repeat(48)}</div>

        <div className={styles.bottomRow}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Philosophers</div>
            <div className={styles.entry}>Vilém Flusser <span>(1920 – 1991)</span></div>
            <div className={styles.entry}>Joseph Weizenbaum <span>(1923 – 2008)</span></div>
            <div className={styles.entry}>Paul Virilio <span>(1932 – 2018)</span></div>
            <div className={styles.entry}>Peter Weibel <span>(1944 – 2023)</span></div>
          </div>

          <div className={styles.qrBlock}>
            <div className={styles.qrLabel}>Scan to fill out the survey:</div>
            <img
              className={styles.qrImage}
              src="/images/qr-survey.png"
              alt="Survey QR code"
            />
          </div>
        </div>

        <div className={styles.divider}>{'─'.repeat(48)}</div>

        <div className={styles.venue}>
          First public demonstration · Wisdome, Göteborg, Sweden
        </div>

      </div>
    </div>
  );
};

export default Credits;
