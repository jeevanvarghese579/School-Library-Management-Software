import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, UserPlus, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';

export function LoginPage() {
  const { signIn, signUp, requestAccess, accessState, accessMessage, firebaseUser, session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error, allowed } = await fn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      if (allowed) {
        toast.success(mode === 'signin' ? 'Signed in successfully' : 'Account created successfully');
        navigate('/');
      } else {
        toast.info(mode === 'signup' ? 'Account created. Request administrator access to continue.' : 'Signed in. Administrator access is required.');
      }
    }
  };

  useEffect(() => {
    if (session) navigate('/');
  }, [session, navigate]);

  const handleRequestAccess = async () => {
    setLoading(true);
    const { error } = await requestAccess();
    setLoading(false);
    if (error) toast.error(error);
    else toast.success('Access request sent to the administrator.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-blue-600 rounded-2xl text-white mb-4 shadow-lg shadow-blue-200">
            <Library size={36} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">School Library Management</h1>
          <p className="text-slate-500 mt-1">Sign in to manage your library</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <LogIn size={16} /> Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <UserPlus size={16} /> Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="librarian@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {firebaseUser && accessState !== 'allowed' && accessState !== 'checking' && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div className="space-y-3">
                  <p>{accessMessage ?? 'Administrator approval is required.'}</p>
                  {accessState === 'denied' && (
                    <Button type="button" size="sm" onClick={handleRequestAccess} disabled={loading}>
                      Request Access
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 text-center mt-6">
            Creating an account does not grant library access. An administrator must approve it.
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Developed by{' '}
          <a
            href="https://itsjeevanvarghese.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-medium"
          >
            Jeevan Varghese
          </a>
        </p>
      </div>
    </div>
  );
}
