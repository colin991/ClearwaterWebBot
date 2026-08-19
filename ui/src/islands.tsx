import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { StrictMode, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { RippleButton, RippleButtonRipples } from '@/components/animate-ui/primitives/buttons/ripple';
import { ScrollProgress, ScrollProgressProvider } from '@/components/animate-ui/primitives/animate/scroll-progress';
import { Blur } from '@/components/animate-ui/primitives/effects/blur';
import { Fade } from '@/components/animate-ui/primitives/effects/fade';
import { Magnetic } from '@/components/animate-ui/primitives/effects/magnetic';
import { Shine } from '@/components/animate-ui/primitives/effects/shine';
import { Slide } from '@/components/animate-ui/primitives/effects/slide';
import { Tilt } from '@/components/animate-ui/primitives/effects/tilt';
import { Zoom } from '@/components/animate-ui/primitives/effects/zoom';
import { GradientText } from '@/components/animate-ui/primitives/texts/gradient';
import { HighlightText } from '@/components/animate-ui/primitives/texts/highlight';
import { ShimmeringText } from '@/components/animate-ui/primitives/texts/shimmering';
import { SlidingNumber } from '@/components/animate-ui/primitives/texts/sliding-number';
import { SplittingText } from '@/components/animate-ui/primitives/texts/splitting';

const TITLE_GRADIENT =
  'linear-gradient(90deg, #f4f8ff 0%, #9abcff 22%, #7aa0e8 50%, #9abcff 78%, #f4f8ff 100%)';

const roots = new Set<Root>();

function mount(node: ReactNode, target: Element) {
  const root = createRoot(target);
  roots.add(root);
  flushSync(() => {
    root.render(<StrictMode>{node}</StrictMode>);
  });
}

function replaceWithMount(el: Element) {
  const host = document.createElement('span');
  host.className = 'aui-mount';
  el.replaceWith(host);
  return host;
}

function ActionLink({
  href,
  className,
  text,
  target,
  rel,
}: {
  href: string;
  className: string;
  text: string;
  target?: string;
  rel?: string;
}) {
  return (
    <Magnetic strength={0.2} range={84} onlyOnHover style={{ display: 'inline-flex' }}>
      <Shine
        enableOnHover
        color="rgba(220, 232, 255, 0.55)"
        opacity={0.38}
        duration={900}
        style={{ display: 'inline-flex', borderRadius: 'inherit' }}
      >
        <RippleButton asChild hoverScale={1.02} tapScale={0.98}>
          <a className={className} href={href} target={target || undefined} rel={rel || undefined}>
            {text}
            <RippleButtonRipples color="rgba(154, 188, 255, 0.38)" />
          </a>
        </RippleButton>
      </Shine>
    </Magnetic>
  );
}

function LiveSlidingNumber({ source }: { source: HTMLElement }) {
  const read = () => {
    if (source.dataset.auiOffline === '1') return null;
    const next = Number(source.dataset.auiValue);
    return Number.isFinite(next) ? next : 0;
  };
  const [value, setValue] = useState<number | null>(read);

  useEffect(() => {
    const sync = () => setValue(read());
    source.addEventListener('aui-value', sync);
    const observer = new MutationObserver(sync);
    observer.observe(source, {
      attributes: true,
      attributeFilter: ['data-aui-value', 'data-aui-offline'],
    });
    sync();
    return () => {
      source.removeEventListener('aui-value', sync);
      observer.disconnect();
    };
  }, [source]);

  if (value === null) return <>—</>;
  return <SlidingNumber number={value} thousandSeparator="," decimalPlaces={0} />;
}

function hydrateLiveNumber(el: HTMLElement) {
  const host = document.createElement('span');
  host.className = 'aui-live-number';
  host.setAttribute('aria-hidden', 'true');
  el.after(host);
  el.classList.add('aui-live-source');
  mount(<LiveSlidingNumber source={el} />, host);
}

function hydrateShimmer(el: HTMLElement) {
  const text = el.textContent?.trim() || '';
  if (!text) return;
  const color = el.dataset.auiColor || 'rgba(154, 188, 255, 0.72)';
  const shimmeringColor = el.dataset.auiShimmer || '#e8f0ff';
  mount(
    <ShimmeringText text={text} duration={1.15} color={color} shimmeringColor={shimmeringColor} />,
    el,
  );
}

function hydrateHome() {
  const logo = document.querySelector<HTMLImageElement>('[data-aui="home-logo"]');
  if (logo) {
    const host = replaceWithMount(logo);
    host.classList.add('stage-logo-motion');
    mount(
      <Zoom initialScale={0.88} delay={0.04}>
        <Tilt maxTilt={7} perspective={900}>
          <img
            className={logo.className}
            src={logo.src}
            alt={logo.alt}
            width={logo.width || 120}
            height={logo.height || 120}
          />
        </Tilt>
      </Zoom>,
      host,
    );
  }

  const title = document.querySelector<HTMLElement>('[data-aui="home-title"]');
  if (title) {
    const text = title.textContent?.trim() || 'Clearwater Roleplay';
    mount(
      <GradientText
        text={text}
        gradient={TITLE_GRADIENT}
        transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
      />,
      title,
    );
  }

  document.querySelectorAll<HTMLElement>('[data-aui-live]').forEach(hydrateLiveNumber);

  document.querySelectorAll<HTMLAnchorElement>('[data-aui="action"]').forEach((link) => {
    const host = replaceWithMount(link);
    host.classList.add('aui-action-wrap');
    mount(
      <ActionLink
        href={link.getAttribute('href') || link.href}
        className={link.className}
        text={link.textContent?.trim() || ''}
        target={link.getAttribute('target') || ''}
        rel={link.getAttribute('rel') || ''}
      />,
      host,
    );
  });
}

function hydrateDepartments() {
  const kicker = document.querySelector<HTMLElement>('[data-aui="departments-kicker"]');
  if (kicker) hydrateShimmer(kicker);

  const title = document.querySelector<HTMLElement>('[data-aui="departments-title"]');
  if (title) {
    const text = title.textContent?.trim() || 'Departments';
    mount(
      <SplittingText
        text={text}
        type="chars"
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        stagger={0.035}
      />,
      title,
    );
  }

  document.querySelectorAll<HTMLElement>('.department-row').forEach((row, index) => {
    const copy = row.querySelector('.department-copy');
    const heading = copy?.querySelector('h2')?.textContent?.trim() || '';
    const body = copy?.querySelector('p')?.textContent?.trim() || '';
    const join = row.querySelector<HTMLAnchorElement>('.department-join');
    if (!join) return;
    row.classList.add('aui-department-row');
    mount(
      <Slide inView delay={index * 0.05} offset={28} direction="up" style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 'inherit' }}>
        <div className="department-copy">
          <h2>{heading}</h2>
          <p>{body}</p>
        </div>
        <ActionLink
          href={join.getAttribute('href') || join.href}
          className={join.className}
          text={join.textContent?.trim() || 'Join Discord'}
          target={join.getAttribute('target') || ''}
          rel={join.getAttribute('rel') || ''}
        />
      </Slide>,
      row,
    );
  });
}

function hydrateDocs() {
  const progressHost = document.createElement('div');
  progressHost.className = 'aui-scroll-progress-host';
  document.body.prepend(progressHost);
  mount(
    <ScrollProgressProvider global>
      <ScrollProgress
        className="aui-scroll-progress"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: 2,
          zIndex: 80,
          background: 'linear-gradient(90deg, #6aa8ff, #9abcff)',
        } as CSSProperties}
      />
    </ScrollProgressProvider>,
    progressHost,
  );

  const intro = document.querySelector<HTMLElement>('.docs-intro');
  if (intro) {
    const kicker = intro.querySelector('.docs-kicker')?.textContent?.trim() || '';
    const heading = intro.querySelector('h1')?.textContent?.trim() || '';
    const buttons = Array.from(intro.querySelectorAll<HTMLAnchorElement>('.docs-btn')).map((link) => ({
      href: link.getAttribute('href') || link.href,
      className: link.className,
      text: link.textContent?.trim() || '',
      target: link.getAttribute('target') || '',
      rel: link.getAttribute('rel') || '',
    }));
    mount(
      <Blur inView initialBlur={8}>
        <Fade inView>
          <p className="docs-kicker">
            <ShimmeringText
              text={kicker}
              duration={1.15}
              color="rgba(154, 188, 255, 0.78)"
              shimmeringColor="#e8f0ff"
            />
          </p>
          <h1>
            <HighlightText
              text={heading}
              inView
              style={{
                backgroundImage: 'linear-gradient(120deg, rgba(106, 168, 255, 0.28), rgba(154, 188, 255, 0.18))',
              }}
            />
          </h1>
          <p>
            {buttons.map((button) => (
              <span key={button.href} className="aui-action-wrap">
                {' '}
                <ActionLink {...button} />
              </span>
            ))}
          </p>
        </Fade>
      </Blur>,
      intro,
    );
  }

  document.querySelectorAll<HTMLElement>('.docs-section').forEach((section, index) => {
    const html = section.innerHTML;
    mount(
      <Slide inView delay={Math.min(index, 6) * 0.04} offset={24} direction="up">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </Slide>,
      section,
    );
  });

  document.querySelectorAll<HTMLAnchorElement>('.docs-section .docs-btn').forEach((link) => {
    const host = replaceWithMount(link);
    host.classList.add('aui-action-wrap');
    mount(
      <ActionLink
        href={link.getAttribute('href') || link.href}
        className={link.className}
        text={link.textContent?.trim() || ''}
        target={link.getAttribute('target') || ''}
        rel={link.getAttribute('rel') || ''}
      />,
      host,
    );
  });
}

function hydrateWallet() {
  document.querySelectorAll<HTMLElement>('[data-aui="wallet-kicker"]').forEach((el) => {
    el.dataset.auiColor = el.dataset.auiColor || '#6aa8ff';
    el.dataset.auiShimmer = el.dataset.auiShimmer || '#dceeff';
    hydrateShimmer(el);
  });
}

export function bootIslands() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const page = document.body;
  if (page.classList.contains('home-stage')) hydrateHome();
  if (page.querySelector('.departments-shell')) hydrateDepartments();
  if (page.classList.contains('docs-body')) hydrateDocs();
  if (page.querySelector('[data-wallet-balance]')) hydrateWallet();
}
