import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-brand-400 transition-colors hover:text-brand-300">
        <ArrowLeft className="h-4 w-4" />
        Back to upload
      </Link>

      <div className="space-y-8">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brand-400">Face Gallery</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Terms and Conditions</h1>
          <p className="mt-3 text-slate-400">A plain-language note about the hosted demo backend.</p>
        </div>

        <div className="space-y-6 text-sm leading-7 text-slate-300">
          <section className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
            <h2 className="mb-2 text-base font-semibold text-amber-200">The demo backend is shared</h2>
            <p>
              The demo backend currently has no per-user separation. Other people using the same demo backend may be able to see sessions and photos uploaded to it. If you would not show something to a stranger, do not upload it here; run your own backend instead.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Demo use only</h2>
            <p>
              The hosted backend at <span className="font-mono text-slate-200">https://api.face-gallery.mrbean.dev</span> exists for demonstration only. It is provided as-is, with no warranty or guarantee that it will be available. It may be reset or taken down at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Your photos and data</h2>
            <p>
              Photos uploaded to the demo backend are stored on that server so they can be processed. The operator does not sell, share, or otherwise use uploaded images beyond running the app for you: there is no training on them, no analytics on image content, and no passing them to third parties.
            </p>
            <p className="mt-3">
              Uploaded data may be deleted at any time. Do not treat the demo backend as storage; keep your own copies.
            </p>
          </section>

          <section className="rounded-xl border border-brand-400/20 bg-brand-400/5 p-5">
            <h2 className="mb-2 text-base font-semibold text-white">Recommended: run your own backend</h2>
            <p>
              Anyone who wants real privacy should run their own backend. Face Gallery is designed for that: it is a download and a double-click. <a href="https://github.com/mrbeandev/Face-Gallery/wiki/Running-Your-Own-Backend" target="_blank" rel="noopener noreferrer" className="text-brand-400 underline hover:text-brand-300">Follow the setup instructions</a> and use your own backend instead of the shared demo.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">Use it responsibly</h2>
            <p>
              Do not upload images you do not have the right to upload, or anything unlawful. The operator is not responsible for how you use the app or for any loss of data.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
