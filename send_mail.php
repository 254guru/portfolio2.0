<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PhpImap\Mailbox;

require 'vendor/autoload.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Handling form submission and sending email
    if (isset($_POST['fullname'], $_POST['email'], $_POST['message'])) {
        $name = $_POST['fullname'];
        $email = $_POST['email'];
        $message = $_POST['message'];

        $mail = new PHPMailer(true);
        // $mail->SMTPDebug = 2; // Enable verbose debug output

        try {
            // Server settings
            $mail->isSMTP();
            $mail->Host = 'smtp.gmail.com'; // Set the SMTP server to send through
            $mail->SMTPAuth = true;
            $mail->Username = 'oludakevin@gmail.com'; // SMTP username
            $mail->Password = 'dntx hwjd vpxc zpcp'; // SMTP password
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; // Enable TLS encryption
            $mail->Port = 587; // TCP port to connect to

            // Recipients
            $mail->setFrom($email, $name);
            $mail->addAddress('oludakevin@gmail.com'); // Add a recipient

            // Content
            $mail->isHTML(true);
            $mail->Subject = 'New Contact Form Submission';
            $mail->Body = "Name: $name<br>Email: $email<br>Message: $message";

            $mail->send();
            echo 'Message has been sent';
        } catch (Exception $e) {
            echo "Message could not be sent. Mailer Error: {$mail->ErrorInfo}";
        }
    } else {
        echo 'Invalid form submission';
    }
} elseif ($_SERVER["REQUEST_METHOD"] == "GET") {
    // Handling email retrieval using IMAP/POP
    try {
        // Define mailbox connection parameters for IMAP
        $mailbox = new Mailbox(
            '{imap.gmail.com:993/imap/ssl}INBOX', // IMAP server and mailbox folder
            'oludakevin@gmail.com',               // Username for the before configured mailbox
            'yflv yidy rzqi dzxd',                // Password for the before configured username
            __DIR__                               // Directory where attachments will be saved (optional)
        );

        // Read all messages into an array:
        $mailsIds = $mailbox->searchMailbox('ALL');
        if (!$mailsIds) {
            die('Mailbox is empty');
        }

        // Get the first message and fetch the data:
        $mail = $mailbox->getMail($mailsIds[0]);

        // Output mail details
        echo "Subject: " . $mail->subject . "\n";
        echo "From: " . $mail->fromAddress . "\n";
        echo "Body: " . $mail->textHtml . "\n"; // Or $mail->textPlain

        // Download attachments
        foreach ($mail->getAttachments() as $attachment) {
            echo "Attachment: " . $attachment->name . "\n";
        }
    } catch (Exception $e) {
        echo "An error occurred while fetching emails: " . $e->getMessage();
    }
}
?>