const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(
    process.env.RESEND_API_KEY_2 ||
    process.env.RESEND_API_KEY
);

const BATCH_SIZE = 100;

async function sendEmail(email) {
    return resend.emails.send({
          from: process.env.EMAIL_FROM || 'urBackend <urbackend@apps.bitbros.in>',
        to: email,
        subject: 'Try urBackend',
        html: `
            <h2>Hi there 👋</h2>

            <p>I'm building urBackend, an open-source backend platform that helps developers build APIs and backend services faster.</p>

            <p>I'd love for you to try it out and share feedback.</p>

            <p>
                <a href="https://urbackend.bitbros.in">
                    Try urBackend
                </a>
            </p>

            <p>Thanks!</p>
        `
    });
}

async function main() {
    const emails = fs
        .readFileSync(
            path.join(__dirname, 'emails.txt'),
            'utf8'
        )
        .split(/\r?\n/)
        .map(e => e.trim())
        .filter(Boolean);

     const parsed = Number(process.argv[2]);
   const batchSize = Number.isInteger(parsed) && parsed > 0 ? parsed : BATCH_SIZE;
    const batch = emails.slice(0, Math.min(batchSize, emails.length));
    console.log(`Sending ${batch.length} emails...`);

     const redactEmail = (value) => {
       const [local, domain] = String(value).split('@');
        if (!domain) return '***';
        return `${local?.slice(0, 2) || '**'}***@${domain}`;
    };

    for (const email of batch) {
        try {
            await sendEmail(email);
          console.error(`✗ ${redactEmail(email)}`, err.message);
            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );

        } catch (err) {
             console.error(`✗ ${redactEmail(email)}`, err.message);
        }
    }

    console.log('Finished');
}

main();