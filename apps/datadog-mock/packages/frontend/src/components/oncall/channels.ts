import { Mail, MessageSquare, MessagesSquare, Phone, Smartphone, type LucideIcon } from 'lucide-react';
import type { Channel } from '@oncall';

export const CHANNELS: Record<Channel, { label: string; icon: LucideIcon }> = {
  push: { label: 'Push', icon: Smartphone },
  sms: { label: 'SMS', icon: MessageSquare },
  voice: { label: 'Voice call', icon: Phone },
  email: { label: 'Email', icon: Mail },
  chat: { label: 'Chat', icon: MessagesSquare },
};
