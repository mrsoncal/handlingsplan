import React from "react";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-social">
        <div className="container">
          <div className="footer-social-row">
            <a href="https://www.facebook.com/telemarkfylkeskommune" title="Facebook - Telemark fylkeskommune" className="footer-social-btn footer-social-facebook" target="_blank" rel="noreferrer noopener">
              <span className="footer-social-icon"><img src={`${import.meta.env.BASE_URL}f.png`} className="footer-social-img" alt="Facebook" /></span>
            </a>
            <a href="https://www.instagram.com/telemarkungdom/" title="Instagram - Telemark fylkeskommune" className="footer-social-btn footer-social-instagram" target="_blank" rel="noreferrer noopener">
              <span className="footer-social-icon"><img src={`${import.meta.env.BASE_URL}ig.png`} className="footer-social-img" alt="Instagram" /></span>
            </a>
          </div>
        </div>
      </div>
      <div className="footer-main">
        <div className="container footer-main-grid">
          <div className="footer-col">
            <p><strong>Kontakt oss</strong></p>
            <p>Telemark Ungdomsråd<br />Postboks 2844<br />3702 Skien</p>
            <p>Koordinator for Telemark Ungdomsråd<br /><a href="mailto:heidi.bekkevold@telemarkfylke.no">heidi.bekkevold@telemarkfylke.no</a><br />+47 991 55 531</p>
          </div>
          <div className="footer-col">
            <p><strong>Telemark Ungdomsråd</strong></p>
            <p><strong>Leder:</strong> Helene Clausen Endresen<br /><a href="mailto:helene.c.endresen@gmail.com">helene.c.endresen@gmail.com</a><br />+47 463 14 573</p>
            <p><strong>Nestleder:</strong> Mats Svendsen<br /><a href="mailto:mats08svendsen@gmail.com">mats08svendsen@gmail.com</a><br />+47 483 95 289</p>
            <p><strong>Nettsideutvikler:</strong> Sondre Callaerts<br /><a href="mailto:mrsoncal@gmail.com">mrsoncal@gmail.com</a><br />+47 929 57 188</p>
          </div>
          <div className="footer-col" aria-hidden="true" />
          <div className="footer-col footer-decoration">
            <svg xmlns="http://www.w3.org/2000/svg" width="158" height="243" viewBox="0 0 158 243" fill="none" aria-hidden="true">
              <path opacity="0.8" d="M79 81V161.985V162V243C35.3754 242.985 0.01422 206.729 0 162V81H79Z" fill="white" />
              <path opacity="0.4" d="M79 162C79.0063 117.264 114.362 81 157.974 81C157.983 81 157.991 81 158 81V162H79Z" fill="white" />
              <path opacity="0.6" d="M158 243C157.994 198.264 122.638 162 79.0261 162C79.0174 162 79.0087 162 79 162V243H158Z" fill="white" />
              <rect opacity="0.8" x="79" width="79" height="81" fill="white" />
            </svg>
          </div>
        </div>
        <div className="container footer-bottom">
          <div className="footer-logo-block"><img src={`${import.meta.env.BASE_URL}TU-logo-bw-wide.png`} alt="Telemark Ungdomsråd" className="footer-logo" /></div>
          <ul className="footer-links">
            <li>© Sondre Callaerts — Frigitt til fri bruk</li>
            <li className="footer-links-badge"><a href="https://www.telemarkfylke.no/link/22cdc346a84a49e5add33a4198ce23ed.aspx" target="_blank" rel="noreferrer noopener"><img src="https://www.telemarkfylke.no/globalassets/Administrasjon/tfk/system/layout/miljofyrtaarn-logo-svart.svg" alt="Miljøfyrtårn logo" /></a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
