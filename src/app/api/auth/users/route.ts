import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllUsers,
  usersDb,
  refuseWithout,
  hashPassword, 
  AppUser, 
  DEFAULT_ADMIN_PERMISSIONS, 
  DEFAULT_HAWKER_PERMISSIONS, 
  DEFAULT_OPERATOR_PERMISSIONS 
} from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const refused = await refuseWithout(req, 'can_manage_users');
    if (refused) return refused;

    const users = await getAllUsers();
    const safeUsers = users.map(({ password_hash, ...u }) => u);
    return NextResponse.json({ users: safeUsers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const refused = await refuseWithout(req, 'can_manage_users');
    if (refused) return refused;

    const body = await req.json();
    const { 
      id, 
      username, 
      password, 
      name, 
      role = 'operator', 
      hawker_id, 
      phone, 
      is_active = true, 
      permissions 
    } = body;

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();
    const users = await getAllUsers();
    const now = new Date().toISOString();

    let targetPermissions = permissions;
    if (!targetPermissions) {
      if (role === 'admin') targetPermissions = DEFAULT_ADMIN_PERMISSIONS;
      else if (role === 'operator') targetPermissions = DEFAULT_OPERATOR_PERMISSIONS;
      else targetPermissions = DEFAULT_HAWKER_PERMISSIONS;
    }

    const existingIndex = users.findIndex(u => u.id === id || u.username.toLowerCase() === cleanUsername);

    if (existingIndex >= 0) {
      const existing = users[existingIndex];
      const updatedUser: AppUser = {
        ...existing,
        name: name || existing.name,
        role: role || existing.role,
        hawker_id: hawker_id !== undefined ? Number(hawker_id) : existing.hawker_id,
        phone: phone !== undefined ? phone : existing.phone,
        is_active: is_active !== undefined ? is_active : existing.is_active,
        permissions: targetPermissions,
        password_hash: password && password.trim() ? hashPassword(password) : existing.password_hash,
        updated_at: now
      };

      const db = await usersDb();
      const { error: saveErr } = await db.from('app_users').upsert({
        ...updatedUser,
        permissions: JSON.stringify(updatedUser.permissions)
      });
      if (saveErr) throw new Error(`Could not save user: ${saveErr.message}`);

      const { password_hash, ...safe } = updatedUser;
      return NextResponse.json({ success: true, user: safe, message: 'User updated successfully' });
    } else {
      if (!password || !password.trim()) {
        return NextResponse.json({ error: 'Password is required for new user' }, { status: 400 });
      }

      const newUser: AppUser = {
        id: id || `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username: cleanUsername,
        password_hash: hashPassword(password),
        name: name || cleanUsername,
        role: role,
        hawker_id: hawker_id ? Number(hawker_id) : undefined,
        phone: phone || '',
        is_active: true,
        permissions: targetPermissions,
        created_at: now,
        updated_at: now
      };

      const db = await usersDb();
      const { error: saveErr } = await db.from('app_users').insert({
        ...newUser,
        permissions: JSON.stringify(newUser.permissions)
      });
      if (saveErr) throw new Error(`Could not save user: ${saveErr.message}`);

      const { password_hash, ...safe } = newUser;
      return NextResponse.json({ success: true, user: safe, message: 'User created successfully' });
    }
  } catch (error: any) {
    console.error('Error managing users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const refused = await refuseWithout(req, 'can_manage_users');
    if (refused) return refused;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const username = searchParams.get('username');

    if (!id && !username) {
      return NextResponse.json({ error: 'User ID or username is required' }, { status: 400 });
    }

    if (username?.toLowerCase() === 'ananews' || id === 'user_admin_001') {
      return NextResponse.json({ error: 'Main administrator account cannot be deleted' }, { status: 403 });
    }

    const db = await usersDb();
    const { error: delErr } = id
      ? await db.from('app_users').delete().eq('id', id)
      : await db.from('app_users').delete().eq('username', username!.toLowerCase());
    if (delErr) throw new Error(`Could not delete user: ${delErr.message}`);

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
