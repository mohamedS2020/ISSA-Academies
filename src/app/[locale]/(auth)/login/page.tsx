import { getAcademyHostContext } from '@/lib/tenant/host-context';
import { LoginScreen } from '@/components/auth/login-screen';

/**
 * Sign-in page, for the main domain and every academy subdomain.
 *
 * A server component only to look up which academy's subdomain this is (the
 * same cached lookup the layout uses for the page title and sport theme);
 * the screen itself, and the sign-in logic, live in LoginScreen.
 */
export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  const academy = await getAcademyHostContext();
  return <LoginScreen locale={locale} academyName={academy?.name ?? null} />;
}
