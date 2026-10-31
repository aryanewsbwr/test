import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Return safe user object (excluding password hash)
    const { password_hash, ...safeUser } = user;

    const res = NextResponse.json({
      success: true,
      user: safeUser,
      message: `Welcome back, ${user.name}!`
    });
    await setSessionCookie(res, req, user.id);
    return res;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    );
  }
}
