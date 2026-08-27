import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
        <img src="/media/logo.svg" alt="Bubld" className="h-8 w-auto" />
        <h1 className="text-lg font-bold text-fg">Tasks</h1>
      </div>
      <LoginForm />
    </main>
  );
}
