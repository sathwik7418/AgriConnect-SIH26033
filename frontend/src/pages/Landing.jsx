import { Link } from 'react-router-dom';
import { Sprout, ShoppingCart, Truck, BarChart3, ArrowRight, ShieldCheck, Landmark, Zap, TrendingUp, Users, ChevronRight, ArrowUpRight } from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function Landing() {
  const containerRef = useScrollReveal();

  return (
    <div ref={containerRef} className="bg-atmospheric min-h-screen relative overflow-hidden flex flex-col">
      {/* Atmospheric Background — layered glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,197,94,0.15) 0%, transparent 60%)'
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 40% at 80% 20%, rgba(34,197,94,0.06) 0%, transparent 50%)'
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 50% 50% at 10% 80%, rgba(34,197,94,0.04) 0%, transparent 50%)'
      }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)',
        backgroundSize: '32px 32px'
      }} />

      {/* Navigation */}
      <header className="sticky top-0 z-50" style={{ borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.88)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
              <Sprout className="h-4.5 w-4.5" style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>Agri<span style={{ color: 'var(--accent)' }}>Connect</span></span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-ghost text-sm px-3 py-2">Sign In</Link>
            <Link to="/register" className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
              Get Started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 z-10 w-full">
        <div className="text-center max-w-3xl mx-auto space-y-6 reveal reveal-up">
          {/* SIH Badge with glow ring */}
          <div className="flex justify-center">
            <span className="badge glow-ring animate-pulse-glow" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border-accent)', boxShadow: '0 0 20px var(--accent-glow), 0 0 0 1px var(--border-accent)' }}>
              <Zap className="w-3 h-3" />
              Smart India Hackathon 2026
            </span>
          </div>

          {/* Power statement headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08]" style={{ color: 'var(--text-primary)' }}>
            From Soil to Market
            <br />
            <span className="gradient-text">Instantly</span>
          </h1>

          {/* Clean subtitle */}
          <p className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            A direct farmer-to-buyer marketplace eliminating intermediaries, ensuring fair pricing, and transparent logistics across India.
          </p>

          {/* Two CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link to="/register?role=FARMER" className="group btn-primary text-base px-6 py-3.5 flex items-center justify-center gap-2">
              <Sprout className="h-5 w-5" />
              Start Selling
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/register?role=BUYER" className="group btn-secondary text-base px-6 py-3.5 flex items-center justify-center gap-2">
              <ShoppingCart className="h-5 w-5" style={{ color: 'var(--accent)' }} />
              Browse Marketplace
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Problem Statement — Why AgriConnect */}
        <div className="mt-20 md:mt-28 reveal reveal-up reveal-delay-1">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <span className="badge badge-danger mb-4" style={{ fontSize: '11px', padding: '3px 10px' }}>Pain Points</span>
              <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                The Problem We Solve
              </h2>
              <p className="text-sm mt-2 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Multiple intermediaries reduce farmers' earnings and increase consumer prices.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-children">
              {[
                { step: '01', icon: Sprout, color: 'var(--accent)', title: 'Farmer Lists Produce', desc: 'Farmers post their crops directly with quantity, grade, and asking price — no broker required.', accentBg: 'rgba(239,68,68,0.10)', accentBorder: 'rgba(239,68,68,0.15)' },
                { step: '02', icon: ShieldCheck, color: 'var(--warning)', title: 'Buyer Discovers Supply', desc: 'Buyers browse the marketplace, see real APMC mandi reference prices, and order directly.', accentBg: 'rgba(245,158,11,0.10)', accentBorder: 'rgba(245,158,11,0.15)' },
                { step: '03', icon: Truck, color: 'var(--info)', title: 'Transparent Logistics', desc: 'OSRM route calculations show exact distance, travel time, and fair transport costs upfront.', accentBg: 'rgba(59,130,246,0.10)', accentBorder: 'rgba(59,130,246,0.15)' },
              ].map(({ step, icon: Icon, color, title, desc, accentBg, accentBorder }) => (
                <div key={step} className="relative group">
                  <div className="card-atmospheric hover-premium p-6 h-full" style={{ background: `linear-gradient(145deg, ${accentBg} 0%, rgba(255,255,255,0.95) 100%)`, borderColor: accentBorder }}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>STEP {step}</span>
                      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}12`, border: `1px solid ${color}20` }}>
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Core Capabilities — 2x2 grid */}
        <div className="mt-20 md:mt-24 reveal reveal-up reveal-delay-2">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Core Capabilities
            </h2>
            <p className="text-sm mt-2 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Everything you need for transparent agricultural trade.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto stagger-children">
            {[
              { icon: Sprout, color: 'var(--accent)', title: 'Direct Trading', desc: 'Farmers post listings directly. Buyers order fresh produce without brokers, ensuring higher earnings for growers and lower costs for purchasers.', stat: '0 intermediaries' },
              { icon: BarChart3, color: 'var(--warning)', title: 'Mandi Intelligence', desc: 'Access real-time APMC government market prices. State and district level guides help users trade at realistic values.', stat: 'Live APMC data' },
              { icon: Truck, color: 'var(--info)', title: 'Route Logistics', desc: 'OSRM route calculations with estimated distance, travel times, and fair transport cost indicators for pickup and delivery coordination.', stat: 'OSRM-powered' },
              { icon: ShieldCheck, color: '#a855f7', title: 'Secure Transactions', desc: 'JWT authentication, IDOR protection, contact privacy until order confirmation, and role-based access control throughout the platform.', stat: 'Enterprise security' },
            ].map(({ icon: Icon, color, title, desc, stat }) => (
              <div key={title} className="card-atmospheric hover-premium p-6 flex gap-5 group" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(250,250,249,0.92) 100%)' }}>
                <div className="shrink-0">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:animate-float" style={{ background: `linear-gradient(135deg, ${color}12, ${color}06)`, border: `1px solid ${color}20` }}>
                    <Icon className="h-6 w-6" style={{ color }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${color}08`, color }}>{stat}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Impact — Qualitative metrics with count-up feel */}
        <div className="mt-20 md:mt-24 reveal reveal-up reveal-delay-3">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              How AgriConnect Creates Impact
            </h2>
            <p className="text-sm mb-12 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              By connecting farmers directly with buyers, AgriConnect removes the cost layers that inflate consumer prices while reducing farmer earnings.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 stagger-children">
              {[
                { value: '100%', label: 'Digital Process', color: 'var(--accent)' },
                { value: '0', label: 'Intermediaries', color: 'var(--danger)' },
                { value: '100%', label: 'Price Transparency', color: 'var(--warning)' },
                { value: 'Real-time', label: 'Route Tracking', color: 'var(--info)' },
              ].map(({ value, label, color }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <div className="text-3xl md:text-4xl font-extrabold mb-1 gradient-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  <div className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className="w-8 h-0.5 rounded-full mt-3" style={{ background: color, opacity: 0.4 }} />
                </div>
              ))}
            </div>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { icon: TrendingUp, color: 'var(--accent)', title: 'Higher Farmer Earnings', desc: 'Direct sales eliminate broker commissions, letting farmers keep a larger share of the final price.' },
                { icon: Users, color: 'var(--info)', title: 'Lower Consumer Prices', desc: 'Without intermediary markups, buyers access fresher produce at more competitive rates.' },
                { icon: BarChart3, color: 'var(--warning)', title: 'Price Transparency', desc: 'Real APMC mandi reference prices ensure both parties trade with full market visibility.' },
              ].map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${color}08`, border: `1px solid ${color}12` }}>
                    <Icon className="h-7 w-7" style={{ color }} />
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA — full-width atmospheric */}
        <div className="mt-20 md:mt-28 mb-8 reveal reveal-up reveal-delay-4">
          <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--accent-glow) 0%, var(--bg-surface) 30%, var(--bg-surface) 70%, rgba(34,197,94,0.08) 100%)', border: '1px solid var(--border-accent)' }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.10) 0%, transparent 60%)'
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse 60% 40% at 90% 100%, rgba(34,197,94,0.06) 0%, transparent 50%)'
            }} />
            <div className="relative z-10 text-center p-10 md:p-14">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float" style={{ background: 'var(--accent-dim)', boxShadow: '0 0 30px var(--accent-glow)' }}>
                <Sprout className="h-7 w-7" style={{ color: 'var(--accent)' }} />
              </div>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold mb-3" style={{ color: 'var(--text-primary)' }}>
                Ready to Transform <span className="gradient-text">Agricultural Trade?</span>
              </h2>
              <p className="text-sm md:text-base max-w-lg mx-auto mb-8" style={{ color: 'var(--text-secondary)' }}>
                Join AgriConnect to connect with farmers and buyers across India. No intermediaries, no hidden costs.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register?role=FARMER" className="group btn-primary px-8 py-3.5 text-base flex items-center justify-center gap-2">
                  <Sprout className="h-5 w-5" /> Start Selling <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link to="/register?role=BUYER" className="group btn-secondary px-8 py-3.5 text-base flex items-center justify-center gap-2">
                  <ShoppingCart className="h-5 w-4" /> Browse Marketplace <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — clean, minimal */}
      <footer className="py-8" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
              <Sprout className="h-3 w-3" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>&copy; 2026 AgriConnect. Smart India Hackathon MVP.</p>
          </div>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Secure Direct Trade</span>
            <span style={{ color: 'var(--border-strong)' }}>&middot;</span>
            <span>OSM Geocoding</span>
            <span style={{ color: 'var(--border-strong)' }}>&middot;</span>
            <span>OSRM Logistics</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
