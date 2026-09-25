import Image from "next/image";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f5f8fb] lg:grid lg:grid-cols-[minmax(420px,0.95fr)_1.05fr]">
    <aside className="relative hidden min-h-screen overflow-hidden bg-[#07152f] px-10 py-12 text-white lg:flex lg:flex-col lg:items-center lg:justify-center xl:px-16">
      <div className="absolute -left-44 -top-36 h-[34rem] w-[34rem] rounded-full bg-teal-400/10 blur-3xl" />
      <div className="absolute -bottom-52 -right-36 h-[38rem] w-[38rem] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <Image src="/scorpbook-logo.jpeg" alt="ScorpBook accounting logo" width={1024} height={1024} priority className="h-auto w-full max-w-[410px] rounded-[2rem] shadow-[0_25px_90px_rgba(0,0,0,0.28)]" />
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.28em] text-teal-200">Accounting, made clear</p>
        <h2 className="mt-4 max-w-lg text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">A clearer view of every number.</h2>
        <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">One dependable place for your books, journal entries and financial picture.</p>
      </div>
      <div className="absolute bottom-8 left-10 right-10 flex items-center justify-between text-[11px] text-slate-400 xl:left-16 xl:right-16">
        <span>SCORPIA TECH LTD</span><span>PRIVATE FINANCE WORKSPACE</span>
      </div>
    </aside>

    <section className="flex min-h-screen flex-col items-center justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
      <div className="mb-7 flex items-center gap-3 lg:hidden">
        <Image src="/scorpbook-icon.jpeg" alt="ScorpBook icon" width={900} height={900} priority className="h-14 w-14 rounded-xl" />
        <div><p className="text-lg font-bold tracking-tight text-[#0a1a38]">ScorpBook</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Accounting by Scorpia Tech</p></div>
      </div>
      <div className="w-full max-w-[440px]">{children}</div>
      <p className="mt-8 text-center text-xs text-slate-400">Secure access for Scorpia Tech Ltd</p>
    </section>
  </main>;
}
