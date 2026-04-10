'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
      toast.error(`Avatar upload failed: ${error.message}`)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    setAvatarUrl(urlData.publicUrl)
    toast.success('Avatar updated')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
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
      toast.error(error.message)
    } else {
      toast.success('Profile saved')
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Email — read-only */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Email</label>
        <Input type="email" value={userEmail} disabled />
      </div>

      {/* Avatar upload */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Avatar</label>
        {avatarUrl && (
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
            unoptimized
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          className="mt-2 block text-sm text-muted-foreground"
        />
      </div>

      {/* Display Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Display Name</label>
        <Input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your display name"
        />
      </div>

      {/* Username */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Username</label>
        <Input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your_username"
        />
        {usernameError && <p className="text-sm text-destructive">{usernameError}</p>}
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Tell us about yourself"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Phone</label>
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 000 0000"
        />
      </div>

      {/* Website */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Website</label>
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://your-website.com"
        />
      </div>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
        {saving ? 'Saving...' : 'Save Profile'}
      </Button>
    </form>
  )
}
