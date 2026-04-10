'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Profile = Record<string, any>

interface ProfileFormProps {
  initialProfile: Profile | null
  userEmail: string
}

export function ProfileForm({ initialProfile, userEmail }: ProfileFormProps) {
  const supabase = createClient()

  const [displayName, setDisplayName] = useState<string>(initialProfile?.display_name ?? '')
  const [username, setUsername] = useState<string>(initialProfile?.username ?? '')
  const [bio, setBio] = useState<string>(initialProfile?.bio ?? '')
  const [phone, setPhone] = useState<string>(initialProfile?.phone ?? '')
  const [website, setWebsite] = useState<string>(initialProfile?.website ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string>(initialProfile?.avatar_url ?? '')

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const userId = initialProfile?.id as string

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()
    const filePath = `${userId}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (error) {
      setMessage({ type: 'error', text: `Avatar upload failed: ${error.message}` })
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    setAvatarUrl(urlData.publicUrl)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    setUsernameError(null)

    // Username uniqueness check
    if (username && username !== initialProfile?.username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .maybeSingle()

      if (existing) {
        setUsernameError('Username already taken')
        setSaving(false)
        return
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        username,
        bio,
        phone,
        website,
        avatar_url: avatarUrl,
        profile_complete: displayName !== '' && username !== '',
      })
      .eq('id', userId)

    setSaving(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Profile saved' })
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Email — read-only */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Email</label>
        <input
          type="email"
          value={userEmail}
          disabled
          className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
        />
      </div>

      {/* Avatar upload */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Avatar</label>
        {avatarUrl && (
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={64}
            height={64}
            className="mt-2 h-16 w-16 rounded-full object-cover"
            unoptimized
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          className="mt-2 block text-sm text-zinc-600"
        />
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {usernameError && <p className="mt-1 text-sm text-red-600">{usernameError}</p>}
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {/* Website */}
      <div>
        <label className="block text-sm font-medium text-zinc-700">Website</label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  )
}
