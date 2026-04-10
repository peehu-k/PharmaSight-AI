type Props = {
  image: string;
};

export default function AnnotatedImage({ image }: Props) {
  if (!image) return null;

  return (
    <img
      src={image}
      alt="annotated"
      className="inspection-image"
      style={{
        maxWidth: "100%",
        width: "auto",
        margin: "0 auto",
        display: "block",
        objectFit: "contain"
      }}
    />
  );
}