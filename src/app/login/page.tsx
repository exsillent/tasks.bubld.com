import Image from "next/image";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
      <Image src="/media/logo.svg" alt="Bubld" width={140} height={40} priority />
      <div className="flex flex-col items-center gap-6 w-full">
        <h1 className="axiBold text-xl text-neutral-900">Sign in to Bubld Tasks</h1>
        <LoginForm />
      </div>
    </main>
  );
}
