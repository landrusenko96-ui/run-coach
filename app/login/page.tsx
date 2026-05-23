import { LoginForm } from "@/app/login/LoginForm";

type LoginPageSearchParams = Record<string, string | string[] | undefined>;

type LoginPageProps = {
  searchParams?: LoginPageSearchParams | Promise<LoginPageSearchParams>;
};

function getSafeNextPath(nextValue: string | string[] | undefined) {
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const errorValue = resolvedSearchParams?.error;
  const nextPath = getSafeNextPath(resolvedSearchParams?.next);
  const callbackError =
    errorValue === "callback" ||
    (Array.isArray(errorValue) && errorValue.includes("callback"));

  return (
    <LoginForm
      initialStatus={callbackError ? "error" : "idle"}
      initialMessage={
        callbackError
          ? "The sign-in link could not be completed. Request a new code and try again."
          : null
      }
      nextPath={nextPath}
    />
  );
}
