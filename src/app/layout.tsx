export const metadata = {
  title: 'Edible Images by Kristen',
  description: 'Order edible image sheets with proofs and fast turnaround.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">{children}</body>
    </html>
  );
}
