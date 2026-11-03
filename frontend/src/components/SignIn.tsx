import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import type { User } from '../types';
import { Brand } from './Brand';

interface SignInProps {
  demoAccounts: User[];
  loadingAccounts: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
}

const ROLE_LABEL: Record<string, string> = {
  recruiter: 'Recruiter',
  client_hiring_manager: 'Client hiring manager',
  delivery_head: 'Delivery head'
};

export default function SignIn({ demoAccounts, loadingAccounts, onLogin }: SignInProps) {
  const [email, setEmail] = useState('priya@companya.in');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const chooseAccount = (account: User) => {
    setEmail(account.email);
    setPassword('demo1234');
    setError('');
  };

  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story__content">
          <span className="eyebrow eyebrow--light">
            <Sparkles size={14} />
            Evidence-first screening
          </span>
          <h1>Shortlists built on evidence, not keyword guesses.</h1>
          <p>
            Score CVs against a structured job scorecard, see the exact lines that support every
            match, and send only recruiter-verified profiles to your client.
          </p>
          <div className="auth-story__points">
            <div>
              <span>01</span>
              <p>AI ranks every CV against the same scorecard.</p>
            </div>
            <div>
              <span>02</span>
              <p>Every score opens to a verbatim quote from the CV.</p>
            </div>
            <div>
              <span>03</span>
              <p>No auto-rejection. A recruiter makes the call.</p>
            </div>
          </div>
        </div>
        <div className="auth-story__footer">
          <ShieldCheck size={16} />
          <span>DPDP-aware access logs, consent records and erasure.</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__heading">
            <span className="eyebrow">Sign in</span>
            <h2>Your hiring workspace</h2>
            <p>Use a demo account below or enter your credentials.</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </label>

            <label>
              Password
              <span className="password-field">
                <LockKeyhole size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {error && <div className="inline-error">{error}</div>}

            <button type="submit" className="button button--primary button--wide" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="demo-accounts">
            <div className="demo-accounts__title">
              <span>Demo accounts</span>
              <span className="muted">password: demo1234</span>
            </div>
            {loadingAccounts ? (
              <div className="demo-accounts__skeleton">
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--line" />
              </div>
            ) : (
              <div className="demo-accounts__list">
                {demoAccounts.map((account) => (
                  <button
                    type="button"
                    key={account.id}
                    className={`demo-account ${email === account.email ? 'is-active' : ''}`}
                    onClick={() => chooseAccount(account)}
                  >
                    <span className={`avatar avatar--${account.role}`}>
                      {account.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <span className="demo-account__text">
                      <strong>{account.name}</strong>
                      <span>{ROLE_LABEL[account.role] || account.role}</span>
                    </span>
                    <span className="demo-account__company">{account.company_name.split(',')[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="auth-note">
            This is a demo workspace. All candidate and client records are fictional. No real personal
            data is used.
          </p>
        </div>
      </section>
    </div>
  );
}
