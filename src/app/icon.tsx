import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 112,
          background: 'linear-gradient(135deg, #5b4fe0 0%, #8b7bff 100%)',
          color: 'white',
          fontSize: 280,
          fontWeight: 700,
        }}
      >
        ◈
      </div>
    ),
    size,
  );
}
