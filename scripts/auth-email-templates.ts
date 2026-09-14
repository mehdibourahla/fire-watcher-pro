import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Email = {
  subject: string;
  title: string;
  body: string;
  action?: string;
  code?: boolean;
  notification?: boolean;
};

const emails: Record<string, Email> = {
  confirmation: {
    subject: "Confirmez votre adresse e-mail — Nadhir",
    title: "Bienvenue sur Nadhir.",
    body: "Confirmez votre adresse e-mail pour terminer la création de votre compte et retrouver vos zones et vos préférences d’alerte.",
    action: "Confirmer mon adresse",
  },
  recovery: {
    subject: "Réinitialisez votre mot de passe — Nadhir",
    title: "Un nouveau mot de passe.",
    body: "Vous avez demandé à réinitialiser votre mot de passe. Ouvrez ce lien pour en choisir un nouveau et retrouver votre compte.",
    action: "Choisir un mot de passe",
  },
  magic_link: {
    subject: "Votre lien de connexion — Nadhir",
    title: "Retrouvez votre espace.",
    body: "Utilisez ce lien personnel pour vous connecter à votre compte Nadhir.",
    action: "Me connecter",
  },
  invite: {
    subject: "Votre invitation à Nadhir",
    title: "Votre espace vous attend.",
    body: "Vous avez été invité à rejoindre Nadhir. Acceptez cette invitation pour configurer votre compte.",
    action: "Accepter l’invitation",
  },
  email_change: {
    subject: "Confirmez votre changement d’adresse — Nadhir",
    title: "Confirmez cette adresse.",
    body: "Une demande de changement d’adresse e-mail a été effectuée pour votre compte. Confirmez votre accord à l’aide du bouton ci-dessous.",
    action: "Confirmer le changement",
  },
  reauthentication: {
    subject: "Votre code de vérification — Nadhir",
    title: "Vérifions que c’est vous.",
    body: "Saisissez ce code dans Nadhir pour confirmer votre identité. Ne le communiquez à personne.",
    code: true,
  },
  password_changed_notification: {
    subject: "Votre mot de passe a été modifié — Nadhir",
    title: "Mot de passe modifié.",
    body: "Le mot de passe de votre compte Nadhir vient d’être modifié.",
    notification: true,
  },
  email_changed_notification: {
    subject: "Votre adresse e-mail a été modifiée — Nadhir",
    title: "Adresse e-mail modifiée.",
    body: "L’adresse e-mail associée à votre compte Nadhir vient d’être modifiée.",
    notification: true,
  },
  phone_changed_notification: {
    subject: "Votre numéro de téléphone a été modifié — Nadhir",
    title: "Numéro de téléphone modifié.",
    body: "Le numéro de téléphone associé à votre compte vient d’être modifié.",
    notification: true,
  },
  identity_linked_notification: {
    subject: "Une méthode de connexion a été ajoutée — Nadhir",
    title: "Nouvelle méthode de connexion.",
    body: "Une méthode de connexion ({{ .Provider }}) vient d’être associée à votre compte.",
    notification: true,
  },
  identity_unlinked_notification: {
    subject: "Une méthode de connexion a été retirée — Nadhir",
    title: "Méthode de connexion retirée.",
    body: "Une méthode de connexion ({{ .Provider }}) vient d’être retirée de votre compte.",
    notification: true,
  },
  mfa_factor_enrolled_notification: {
    subject: "Une vérification de sécurité a été ajoutée — Nadhir",
    title: "Sécurité du compte mise à jour.",
    body: "Une nouvelle méthode de vérification a été ajoutée à votre compte.",
    notification: true,
  },
  mfa_factor_unenrolled_notification: {
    subject: "Une vérification de sécurité a été retirée — Nadhir",
    title: "Sécurité du compte mise à jour.",
    body: "Une méthode de vérification a été retirée de votre compte.",
    notification: true,
  },
};

function renderEmail(email: Email) {
  const link = email.notification
    ? "https://nadhir.app/settings"
    : "{{ .ConfirmationURL }}";
  const action = email.notification ? "Vérifier mon compte" : email.action;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${email.subject}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;color:#161b20;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${email.body}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 24px"><a href="https://nadhir.app" style="font-family:Georgia,serif;font-size:30px;font-weight:bold;color:#03332c;text-decoration:none">Nadhir<span lang="ar" dir="rtl" style="font-family:Arial,sans-serif;font-size:23px;padding-left:10px">نذير</span></a><p style="margin:8px 0 0;color:#5f6469;font-size:13px">L’information pour mieux vous protéger.</p></td></tr>
<tr><td style="background:#ffffff;border:1px solid #dbdee2;border-top:4px solid #03332c;border-radius:12px;padding:32px 24px">
<p style="margin:0 0 16px;color:#03332c;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase">${email.notification ? "Sécurité du compte" : "Votre compte Nadhir"}</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:normal">${email.title}</h1>
<p style="margin:0 0 24px;color:#5f6469;font-size:16px;line-height:1.65">${email.body}</p>
${email.code ? '<p style="margin:0 0 24px;padding:20px 12px;background:#e6f2ef;border-radius:8px;color:#03332c;text-align:center;font-size:32px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>' : ""}
${action ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#03332c" style="border-radius:8px;mso-padding-alt:16px 24px"><a href="${link}" style="display:inline-block;padding:16px 24px;border:1px solid #03332c;border-radius:8px;color:#ffffff;font-size:16px;font-weight:bold;line-height:1.3;text-align:center;text-decoration:none">${action}</a></td></tr></table>` : ""}
<p style="margin:24px 0 0;color:#5f6469;font-size:13px;line-height:1.6">${email.notification ? 'Si vous n’êtes pas à l’origine de ce changement, réinitialisez votre mot de passe depuis <a href="https://nadhir.app/auth?mode=forgot" style="color:#03332c;text-decoration:underline">Nadhir</a> et vérifiez la sécurité de votre compte.' : "Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail. Ne partagez pas ce message : le lien ou le code est personnel et à usage unique."}</p>
${email.action ? '<p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #dbdee2;color:#5f6469;font-size:12px;line-height:1.6">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="{{ .ConfirmationURL }}" style="color:#03332c;word-break:break-all;overflow-wrap:anywhere">{{ .ConfirmationURL }}</a></p>' : ""}
</td></tr>
<tr><td style="padding:24px 8px;text-align:center;color:#5f6469;font-size:12px;line-height:1.7">Ce message concerne votre compte. Il ne s’agit pas d’une alerte de sécurité civile.<br><a href="https://nadhir.app" style="color:#03332c;text-decoration:underline">nadhir.app</a> · Message automatique, merci de ne pas répondre.</td></tr>
</table></td></tr></table></body></html>`;
}

export function authEmailConfiguration() {
  return Object.fromEntries(
    Object.entries(emails).flatMap(([kind, email]) => [
      [`mailer_subjects_${kind}`, email.subject],
      [`mailer_templates_${kind}_content`, renderEmail(email)],
    ]),
  );
}

if (import.meta.main) {
  const output = process.argv[2];
  if (!output)
    throw new Error(
      "Usage: bun scripts/auth-email-templates.ts <output-directory>",
    );
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "auth-email-config.json"),
    JSON.stringify(authEmailConfiguration(), null, 2),
  );
  for (const [kind, email] of Object.entries(emails)) {
    await writeFile(
      join(output, `${kind}.html`),
      renderEmail(email)
        .replaceAll(
          "{{ .ConfirmationURL }}",
          "https://nadhir.app/auth?preview=example",
        )
        .replaceAll("{{ .Token }}", "123456")
        .replaceAll("{{ .Provider }}", "Google"),
    );
  }
  console.log(
    `Rendered ${Object.keys(emails).length} Nadhir email templates in ${output}`,
  );
}
