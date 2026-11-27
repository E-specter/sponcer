export interface InvitationSender {
  /** `sent`: invitación enviada; `already_registered`: el correo ya tenía cuenta y se le envió un enlace de acceso. */
  invite(email: string): Promise<'sent' | 'already_registered'>;
}
